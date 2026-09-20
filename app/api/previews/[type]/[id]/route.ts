import {
  isPreviewType,
  liveItemPreview,
} from "@/lib/store/previews";
import { notFound } from "../../../_respond";

export const dynamic = "force-dynamic";

/**
 * Live paper screenshot of a source, note, extract, or activity. Seed helpers
 * stand in for notes/extracts/activities until those stores exist.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/previews/[type]/[id]">,
): Promise<Response> {
  const { type, id } = await context.params;
  if (!isPreviewType(type)) return notFound("Preview");

  const image = await liveItemPreview(type, id);
  if (!image) return notFound("Preview");
  return image;
}
