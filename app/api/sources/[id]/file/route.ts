import { Buffer } from "node:buffer";
import { readStoredPdf } from "@/lib/storage/pdf";
import { getSource } from "@/lib/store/sources";
import { fail, notFound } from "../../../_respond";

function inlineFilename(title: string): string {
  const base = title.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "source";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

/**
 * Same-origin PDF bytes for the reader iframe. `Content-Disposition: inline`
 * asks the browser to display pages instead of downloading the file.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/sources/[id]/file">,
): Promise<Response> {
  const { id } = await context.params;
  const source = await getSource(id);
  if (!source) return notFound("Source");
  if (source.kind !== "pdf") {
    return fail("That source is not a PDF.", 409);
  }
  if (!source.storage_key) return notFound("PDF file");

  try {
    const bytes = await readStoredPdf(source.storage_key);
    const filename = inlineFilename(source.title);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return notFound("PDF file");
  }
}
