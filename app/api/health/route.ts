export function GET() {
  return Response.json({
    ok: true,
    db: Boolean(process.env.DATABASE_URL),
    aiMock: process.env.AI_MOCK !== "0",
  });
}
