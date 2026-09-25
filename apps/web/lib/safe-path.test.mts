import assert from "node:assert/strict";
import { test } from "node:test";
import { safeReturnPath } from "./safe-path.ts";

test("keeps a path on this site, with its query and fragment", () => {
  assert.equal(safeReturnPath("/student"), "/student");
  assert.equal(
    safeReturnPath("/teacher/quizzes/abc?tab=1#q2"),
    "/teacher/quizzes/abc?tab=1#q2",
  );
});

test("falls back to / when there is nothing usable", () => {
  for (const from of [undefined, "", "student", ["/a", "/b"]]) {
    assert.equal(safeReturnPath(from), "/");
  }
});

test("never leaves the site, however the address is disguised", () => {
  for (const from of [
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example/login", // the browser strips the tab: //evil.example
    "/\n/evil.example",
    "/\r\n/evil.example",
    "/\\\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
  ]) {
    assert.equal(safeReturnPath(from), "/", JSON.stringify(from));
  }
});
