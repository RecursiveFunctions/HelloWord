import { Diagnostics } from "../contracts";
import { env } from "../env";
import { chatJson } from "./client";
import { REPORT_WINDOW_DAYS, type ConceptStat } from "./data";
import { AiProviderError } from "./errors";
import { parseJsonLoose } from "./json";
import { mockDiagnostics } from "./mock";
import { REPORT_SYSTEM } from "./prompts";

/**
 * The weekly "what should I study next" report.
 *
 * The prize is named "Best Use of Snowflake API", so this is an API call from
 * the app rather than a worksheet. It reads the review_daily continuous
 * aggregate, not the hypertable.
 */

const ATTEMPTS = 2;

/** `max_tokens` is deprecated on Cortex Chat Completions. */
const MAX_COMPLETION_TOKENS = 1_200;

function cortexUrl(account: string): string {
  const host = account.replace(/\.snowflakecomputing\.com$/i, "");
  return `https://${host}.snowflakecomputing.com/api/v2/cortex/v1/chat/completions`;
}

/** Cortex speaks the OpenAI spec, but can answer as SSE even unasked. */
export function contentFrom(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      choices?: { message?: { content?: string }; delta?: { content?: string } }[];
    };
    const choice = parsed.choices?.[0];
    return choice?.message?.content ?? choice?.delta?.content ?? "";
  } catch {
    // Not JSON: treat it as an event stream and stitch the deltas together.
  }
  let text = "";
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const chunk = JSON.parse(payload) as {
        choices?: { delta?: { content?: string }; message?: { content?: string } }[];
      };
      const choice = chunk.choices?.[0];
      text += choice?.delta?.content ?? choice?.message?.content ?? "";
    } catch {
      continue;
    }
  }
  return text;
}

async function askCortex(
  account: string,
  pat: string,
  model: string,
  user: string,
  repair: string | undefined,
): Promise<string> {
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: REPORT_SYSTEM },
    { role: "user", content: user },
  ];
  if (repair) {
    messages.push({
      role: "user",
      content: `Your previous answer did not validate: ${repair}\n\nReturn corrected JSON only.`,
    });
  }

  const response = await fetch(cortexUrl(account), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      // Without this header a PAT is read as a session token and rejected.
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      temperature: 0.2,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new AiProviderError([
      `Snowflake Cortex ${response.status}: ${body.slice(0, 300)}`,
    ]);
  }
  return contentFrom(body);
}

function statsTable(stats: ConceptStat[]): string {
  const rows = stats.map((stat) => {
    const rate = stat.reviews ? Math.round((stat.recalled / stat.reviews) * 100) : 0;
    return `${stat.concept} | reviews ${stat.reviews} | recalled ${stat.recalled} (${rate}%) | stability ${stat.avg_stability.toFixed(1)} | difficulty ${stat.avg_difficulty.toFixed(1)}`;
  });
  return `Last ${REPORT_WINDOW_DAYS} days, one line per concept:\n\n${rows.join("\n")}`;
}

/**
 * The model reasons about what is hard; it does not get to decide what the
 * numbers say. Concepts it invented are dropped, `untouched` is recomputed
 * from the zero-review rows, and a concept cannot be both known and struggling.
 */
export function reconcile(report: Diagnostics, stats: ConceptStat[]): Diagnostics {
  const byLabel = new Map(stats.map((stat) => [stat.concept.toLowerCase(), stat]));
  const real = (label: string) => byLabel.get(label.trim().toLowerCase())?.concept;

  const struggling: Diagnostics["struggling"] = [];
  const strugglingSet = new Set<string>();
  for (const row of report.struggling) {
    const concept = real(row.concept);
    if (!concept || strugglingSet.has(concept)) continue;
    const stat = byLabel.get(concept.toLowerCase())!;
    if (stat.reviews === 0) continue; // unreviewed is untouched, not struggling
    strugglingSet.add(concept);
    struggling.push({ concept, why: row.why.trim() });
  }

  const known = [
    ...new Set(
      report.known
        .map(real)
        .filter((concept): concept is string => concept !== undefined)
        .filter((concept) => !strugglingSet.has(concept))
        .filter((concept) => (byLabel.get(concept.toLowerCase())?.reviews ?? 0) > 0),
    ),
  ];

  const untouched = stats.filter((stat) => stat.reviews === 0).map((stat) => stat.concept);

  return Diagnostics.parse({
    struggling,
    known,
    untouched,
    next_action: report.next_action.trim(),
  });
}

export type ReportResult = {
  report: Diagnostics;
  provider: string;
  model: string;
};

export async function weeklyReport(stats: ConceptStat[]): Promise<ReportResult> {
  if (env.aiMock) {
    return { report: mockDiagnostics(), provider: "mock", model: "fixtures" };
  }

  const user = statsTable(stats);
  const { account, pat, model } = env.snowflake;

  // Without Snowflake credentials the report still works, on Nemotron. The
  // Snowflake track needs the API call; the feature does not.
  if (!account || !pat) {
    const result = await chatJson(Diagnostics, {
      name: "weekly_report",
      system: REPORT_SYSTEM,
      reasoningEffort: "high",
      maxTokens: MAX_COMPLETION_TOKENS,
      temperature: 0.2,
      user,
    });
    return {
      report: reconcile(result.value, stats),
      provider: result.provider,
      model: result.model,
    };
  }

  let repair: string | undefined;
  const failures: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const raw = await askCortex(account, pat, model, user, repair);
    const loose = parseJsonLoose(raw);
    if (loose.ok) {
      const parsed = Diagnostics.safeParse(loose.value);
      if (parsed.success) {
        return {
          report: reconcile(parsed.data, stats),
          provider: "snowflake",
          model,
        };
      }
      repair = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
    } else {
      repair = loose.reason;
    }
    failures.push(`Snowflake Cortex: ${repair}`);
  }
  throw new AiProviderError(failures);
}
