import { z } from "zod";
import { createNotebook, listNotebooks } from "@/lib/store/notebooks";
import { invalid, ok, readJson } from "../_respond";

const CreateNotebookBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour, e.g. #1d4ed8.")
    .optional(),
});

export async function GET(): Promise<Response> {
  return ok({ notebooks: await listNotebooks() });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = CreateNotebookBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const notebook = await createNotebook(parsed.data);
  return ok({ notebook }, 201);
}
