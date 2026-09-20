import { PatchNoteBody } from "@/lib/api";
import { getNote, updateNote } from "@/lib/store/notes";
import { invalid, notFound, ok, readJson } from "../../_respond";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const note = await getNote(id);
  return note ? ok(note) : notFound("Note");
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const parsed = PatchNoteBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { id } = await context.params;
  const note = await updateNote(id, parsed.data);
  return note ? ok(note) : notFound("Note");
}