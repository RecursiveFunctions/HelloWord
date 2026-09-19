import type { z } from "zod";

/** Underscore-prefixed, so the App Router treats this as private, not a route. */

export function ok<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

export function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function notFound(what: string): Response {
  return fail(`${what} not found.`, 404);
}

/** Zod rejections become a flat, readable list rather than a nested tree. */
export function invalid(error: z.ZodError): Response {
  return Response.json(
    {
      error: "Request body failed validation.",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 422 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
