import { CreateNoteBody } from "@/lib/api";
import { addNotebookItems, getNotebook } from "@/lib/store/notebooks";
import { createNote } from "@/lib/store/notes";
import { fail, invalid, notFound, ok, readJson } from "../_respond";

/**
 * Creates an empty or pre-filled note. With `notebook_id` the note is also
 * linked into that notebook, so it is in the Library and the notebook at once.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (body === null) return fail("Expected a JSON body.");

  const parsed = CreateNoteBody.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const { notebook_id, ...input } = parsed.data;
  if (notebook_id && !(await getNotebook(notebook_id))) return notFound("Notebook");

  const note = await createNote(input);
  if (notebook_id) {
    await addNotebookItems(notebook_id, [{ item_type: "note", item_id: note.id }]);
  }
  return ok({ note }, 201);
}
