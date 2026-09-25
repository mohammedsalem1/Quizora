import assert from "node:assert/strict";
import { test } from "node:test";
import { countLabel, MINUTES, POINTS, QUESTIONS } from "./arabic.ts";

test("uses the Arabic noun form each number needs", () => {
  const cases: [number, string][] = [
    [1, "سؤال واحد"],
    [2, "سؤالان"],
    [3, "3 أسئلة"],
    [10, "10 أسئلة"],
    [11, "11 سؤالاً"],
    [99, "99 سؤالاً"],
    [100, "100 سؤال"],
    [102, "102 سؤال"],
    [103, "103 أسئلة"],
    [111, "111 سؤالاً"],
  ];
  for (const [n, expected] of cases) {
    assert.equal(countLabel(n, QUESTIONS), expected, String(n));
  }
});

test("works for every counted noun", () => {
  assert.equal(countLabel(2, MINUTES), "دقيقتان");
  assert.equal(countLabel(105, MINUTES), "105 دقائق");
  assert.equal(countLabel(1, POINTS), "علامة واحدة");
  assert.equal(countLabel(20, POINTS), "20 علامة");
});
