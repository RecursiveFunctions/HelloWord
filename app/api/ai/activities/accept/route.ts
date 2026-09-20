import { z } from "zod";
import { ActivityPayload } from "@/lib/contracts/activity";
import { getNote } from "@/lib/store/notes";
import { createActivities } from "@/lib/store/review";
import { fail, invalid, notFound, ok, readJson } from "../../../_respond";

const AcceptActivitiesBody = z.object({
  note_id: z.string().uuid(),
  source_body_hash: z.string().regex(/^[a-f0-9]{64}$/),
  activities: z.array(ActivityPayload).min(1).max(12),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = AcceptActivitiesBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const note = await getNote(parsed.data.note_id);
  if (!note) return notFound("Note");
  if (note.body_hash !== parsed.data.source_body_hash) {
    return fail("The note changed after these activities were generated. Regenerate them before accepting.", 409);
  }

  const activities = await createActivities(
    note.id,
    note.body_hash,
    parsed.data.activities,
  );
  return ok({ activities }, 201);
}