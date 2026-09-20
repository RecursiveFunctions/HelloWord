import { schemaHealth } from "@/lib/db-schema";

export const dynamic = "force-dynamic";

/**
 * `schema.missing` names migrations the database has not had yet. A non-empty
 * list means the code is ahead of the schema; `npm run db:migrate` fixes it.
 * The status is 503 in that case so an uptime check can see it too.
 */
export async function GET() {
  const schema = await schemaHealth();
  const ok = schema === null || schema.ok;
  return Response.json(
    {
      ok,
      db: Boolean(process.env.DATABASE_URL),
      aiMock: process.env.AI_MOCK !== "0",
      schema,
    },
    { status: ok ? 200 : 503 },
  );
}
