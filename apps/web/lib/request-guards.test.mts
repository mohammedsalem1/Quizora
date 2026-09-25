import assert from "node:assert/strict";
import { test } from "node:test";
import { isJson, proxyPathProblem, sendsBody } from "./request-guards.ts";

test("only reads (GET) and deletes (DELETE) go without a JSON body", () => {
  for (const method of ["POST", "PUT", "PATCH"]) {
    assert.equal(sendsBody(method), true, method);
  }
  assert.equal(sendsBody("GET"), false);
  assert.equal(sendsBody("DELETE"), false);
});

test("accepts JSON and refuses what a cross-site form can send", () => {
  assert.equal(isJson("application/json"), true);
  assert.equal(isJson("application/json; charset=utf-8"), true);
  for (const contentType of [
    null,
    "",
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
  ]) {
    assert.equal(isJson(contentType), false, String(contentType));
  }
});

test("forwards ordinary API paths", () => {
  assert.equal(proxyPathProblem(["student", "quizzes"]), null);
  assert.equal(
    proxyPathProblem(["teacher", "quizzes", "abc", "results"]),
    null,
  );
});

test("refuses paths that climb to another API path", () => {
  assert.equal(proxyPathProblem(["x", "..", "auth", "login"]), 400);
  assert.equal(proxyPathProblem([".", "auth"]), 400);
});

test("refuses the API's login and profile routes in any letter case", () => {
  for (const path of [
    ["auth", "login"],
    ["Auth", "login"],
    ["AUTH", "me"],
  ]) {
    assert.equal(proxyPathProblem(path), 404, path.join("/"));
  }
});
