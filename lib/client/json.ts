/**
 * Reading a JSON body without trusting that the body is JSON.
 *
 * Every route in this app answers with JSON, including its errors — but the
 * platform in front of them does not. A function that exceeds its maxDuration
 * or crashes before it runs is answered by the edge with a plain-text page,
 * and `response.json()` on that throws "Unexpected token 'A', "An error o"...
 * is not valid JSON", which tells a reader nothing about what went wrong.
 */

/** Enough of the body to identify the failure, without pasting a whole page. */
function excerpt(text: string): string {
  const line = text.trim().split("\n").find((part) => part.trim().length > 0) ?? "";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

function describe(response: Response, text: string): string {
  if (response.status === 504 || response.status === 408) {
    return "The request timed out before the server answered.";
  }
  if (response.status === 502 || response.status === 503) {
    return `The server is unavailable (HTTP ${response.status}).`;
  }
  const detail = excerpt(text);
  if (!response.ok) {
    return `The server returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`;
  }
  return `The server sent a response that is not JSON${detail ? `: ${detail}` : "."}`;
}

/**
 * Parses the body, or throws an Error whose message names the real failure.
 * `fallback` is the caller's own description of the operation, so the thrown
 * message reads as one sentence about what the user was trying to do.
 */
export async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${fallback} ${describe(response, text)}`);
  }
}
