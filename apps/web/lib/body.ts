// The API accepts JSON bodies up to 100 KB; the web routes that forward requests refuse
// anything larger before holding it in memory.
export const MAX_BODY_BYTES = 100 * 1024;

// Reads a request body as text, or returns null once it is larger than `maxBytes`. It reads
// the stream piece by piece, so a huge (or never-ending, chunked) upload is cut off early
// instead of filling the web server's memory, even without a Content-Length header.
export async function readLimitedBody(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
