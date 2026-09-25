"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch, errorMessagesOf } from "./api";
import type { SavedAnswer } from "./types";

type Choice = string | null; // an option id, or null for "no answer"

export type SaveState = "saving" | "retrying";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Keeps the answers saved on the server in step with what the student taps, on a phone
// network that can be slow or drop out:
// - At most one request per question is in flight. When it settles, the latest choice is
//   sent next, so the server always ends with the student's last tap, never an older one
//   that happened to arrive later.
// - A lost response (no connection, 502, 5xx) is retried, not undone: the answer may well
//   have been saved, and saving or clearing the same answer again is harmless.
// - Only a definite refusal (4xx) puts the question back to what the server last confirmed.
// - 409 means the attempt is over (submitted on another device, or the time is up).
// - Nothing is sent once the page has gone: a new page loads what the server has.
export function useAnswerSync(
  attemptPath: string,
  initial: SavedAnswer[],
  onAttemptOver: () => void,
) {
  const initialMap = () =>
    new Map<string, Choice>(initial.map((a) => [a.questionId, a.optionId]));
  const [choices, setChoices] = useState<Map<string, Choice>>(initialMap);
  const [saveStates, setSaveStates] = useState<Map<string, SaveState>>(
    () => new Map(),
  );
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());

  // What the async loops read. `desired` mirrors `choices`; `confirmed` is what the server has.
  const desired = useRef(initialMap());
  const confirmed = useRef(initialMap());
  const running = useRef(new Set<string>());
  const over = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // set again when React remounts the page (strict mode)
    return () => {
      alive.current = false;
    };
  }, []);
  // Every tap and every confirmed save gets a number, so a server snapshot fetched earlier
  // can tell which questions changed after it was requested (see reconcile).
  const changeSeq = useRef(0);
  const touchedAt = useRef(new Map<string, number>());
  const touch = (questionId: string) =>
    touchedAt.current.set(questionId, ++changeSeq.current);
  const onOver = useRef(onAttemptOver);
  useEffect(() => {
    onOver.current = onAttemptOver;
  }, [onAttemptOver]);

  const setIn = <T>(
    set: (update: (prev: Map<string, T>) => Map<string, T>) => void,
    questionId: string,
    value: T | undefined,
  ) =>
    set((prev) => {
      const next = new Map(prev);
      if (value === undefined) next.delete(questionId);
      else next.set(questionId, value);
      return next;
    });

  const sync = useCallback(
    async (questionId: string) => {
      if (running.current.has(questionId)) return; // that loop will send the latest choice
      running.current.add(questionId);
      setIn(setSaveStates, questionId, "saving");
      const url = `${attemptPath}/answers/${questionId}`;
      let retryDelay = 1000;
      // After a lost response the server may hold the value that was sent, not `confirmed`,
      // so the latest choice is sent again even if it equals `confirmed`.
      let uncertain = false;

      while (
        alive.current &&
        !over.current &&
        (uncertain ||
          (desired.current.get(questionId) ?? null) !==
            (confirmed.current.get(questionId) ?? null))
      ) {
        const target = desired.current.get(questionId) ?? null;
        try {
          if (target === null) await apiFetch(url, { method: "DELETE" });
          else
            await apiFetch(url, { method: "PUT", body: { optionId: target } });
          confirmed.current.set(questionId, target);
          touch(questionId);
          uncertain = false;
          retryDelay = 1000;
          setIn(setSaveStates, questionId, "saving");
        } catch (error) {
          const status = error instanceof ApiError ? error.status : 500;
          if (status === 401) {
            over.current = true; // the session ended; apiFetch is taking them to the login page
            break;
          }
          if (status === 409) {
            over.current = true;
            if (alive.current) onOver.current();
            break;
          }
          if (status >= 400 && status < 500) {
            const back = confirmed.current.get(questionId) ?? null;
            desired.current.set(questionId, back);
            touch(questionId);
            setIn(setChoices, questionId, back);
            setIn(setErrors, questionId, errorMessagesOf(error).join(" "));
            break;
          }
          uncertain = true;
          setIn(setSaveStates, questionId, "retrying");
          await sleep(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 10_000);
        }
      }

      running.current.delete(questionId);
      setIn(setSaveStates, questionId, undefined);
    },
    [attemptPath],
  );

  const choose = useCallback(
    (questionId: string, choice: Choice) => {
      if (over.current) return;
      desired.current.set(questionId, choice);
      touch(questionId);
      setIn(setChoices, questionId, choice);
      setIn(setErrors, questionId, undefined);
      void sync(questionId);
    },
    [sync],
  );

  // Resolves true once nothing is waiting to be saved, or false after `timeoutMs`.
  const settled = useCallback(async (timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (running.current.size > 0) {
      if (Date.now() > deadline) return false;
      await sleep(100);
    }
    return true;
  }, []);

  // A marker to take just before fetching the server's answers, for reconcile().
  const mark = useCallback(() => changeSeq.current, []);

  // Takes the server's answers (e.g. after the phone wakes up, in case a response was lost
  // while it slept), except for questions being saved right now or changed since `since`:
  // for those, the snapshot may already be out of date.
  const reconcile = useCallback((server: SavedAnswer[], since: number) => {
    const fromServer = new Map<string, Choice>(
      server.map((a) => [a.questionId, a.optionId]),
    );
    const questionIds = new Set([
      ...fromServer.keys(),
      ...confirmed.current.keys(),
    ]);
    for (const questionId of questionIds) {
      if (running.current.has(questionId)) continue;
      if ((touchedAt.current.get(questionId) ?? 0) > since) continue;
      const value = fromServer.get(questionId) ?? null;
      confirmed.current.set(questionId, value);
      desired.current.set(questionId, value);
      setIn(setChoices, questionId, value);
    }
  }, []);

  return {
    choiceOf: (questionId: string) => choices.get(questionId) ?? null,
    saveStateOf: (questionId: string) => saveStates.get(questionId),
    errorOf: (questionId: string) => errors.get(questionId),
    answeredCount: [...choices.values()].filter((c) => c !== null).length,
    pending: saveStates.size > 0,
    choose,
    settled,
    mark,
    reconcile,
  };
}
