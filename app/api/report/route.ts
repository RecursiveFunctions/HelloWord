import { DiagnosticsResponse } from "@/lib/api";
import { REPORT_WINDOW_DAYS, loadConceptStats } from "@/lib/ai/data";
import { aiErrorResponse } from "@/lib/ai/http";
import { weeklyReport } from "@/lib/ai/snowflake";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The cross-notebook weekly report. Reads review_daily, writes nothing. */
export async function GET() {
  try {
    const stats = await loadConceptStats();
    const { report, provider, model } = await weeklyReport(stats);
    return Response.json(DiagnosticsResponse.parse(report), {
      headers: {
        "x-ai-provider": provider,
        "x-ai-model": model,
        "x-report-window-days": String(REPORT_WINDOW_DAYS),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
