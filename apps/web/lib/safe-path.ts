// Where to go after logging in (?from=…): only a path on this site, so a crafted link can't
// send users to another website. The value is parsed the way the browser will parse it: a
// prefix check alone lets "/<tab>/evil.example" through, which the browser reads as
// "//evil.example".
const SAME_SITE = "http://quizora.invalid";

export function safeReturnPath(from: string | string[] | undefined): string {
  if (typeof from !== "string" || !from.startsWith("/")) return "/";
  try {
    const url = new URL(from, SAME_SITE);
    if (url.origin !== SAME_SITE) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
