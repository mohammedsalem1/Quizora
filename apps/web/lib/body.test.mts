import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_BODY_BYTES, readLimitedBody } from "./body.ts";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://quizora.invalid/api/x", {
    method: "POST",
    body,
    headers,
  });

// A body sent in pieces with no Content-Length, like a chunked upload.
const streamed = (sizes: number[]) =>
  new Request("http://quizora.invalid/api/x", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        for (const size of sizes)
          controller.enqueue(new Uint8Array(size).fill(97));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);

test("reads a normal body as text, including Arabic", async () => {
  assert.equal(
    await readLimitedBody(post('{"title":"اختبار"}')),
    '{"title":"اختبار"}',
  );
});

test("reads an empty body as an empty string", async () => {
  assert.equal(
    await readLimitedBody(
      new Request("http://quizora.invalid/", { method: "POST" }),
    ),
    "",
  );
});

test("accepts exactly the limit and refuses one byte more", async () => {
  assert.equal(
    (await readLimitedBody(post("a".repeat(MAX_BODY_BYTES))))?.length,
    MAX_BODY_BYTES,
  );
  assert.equal(
    await readLimitedBody(post("a".repeat(MAX_BODY_BYTES + 1))),
    null,
  );
});

test("refuses a body whose declared length is too large, without reading it", async () => {
  const request = post("small", {
    "content-length": String(MAX_BODY_BYTES + 1),
  });
  assert.equal(await readLimitedBody(request), null);
});

test("cuts off a streamed body with no Content-Length once it passes the limit", async () => {
  assert.equal(await readLimitedBody(streamed([60 * 1024, 60 * 1024])), null);
  assert.equal((await readLimitedBody(streamed([10, 20])))?.length, 30);
});
