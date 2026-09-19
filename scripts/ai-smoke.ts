import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Proves workstream C's AI layer without a test runner.
 *
 *   npm run smoke:ai          mock mode and the pure repair/parse logic
 *   npm run smoke:ai -- --live  the above, then real model calls, then failover
 *
 * The live phases run as child processes because lib/env.ts snapshots
 * process.env at import: one process cannot be both mocked and live, and the
 * failover phase needs a deliberately broken NVIDIA key.
 */

function loadEnvFile(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const phase = process.argv.find((arg) => arg.startsWith("--phase="))?.slice(8) ?? "mock";
const wantsLive = process.argv.includes("--live");

let failed = 0;

function pass(name: string, detail = "") {
  console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail: string) {
  failed += 1;
  console.log(`  FAIL ${name} — ${detail}`);
}

async function check(name: string, run: () => Promise<string> | string) {
  try {
    pass(name, await run());
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Pure logic: no env, no network, no seed dependence. */
async function runUnitChecks() {
  console.log("\nParsing and repair logic");
  const { parseJsonLoose } = await import("../lib/ai/json");
  const { repairActivity } = await import("../lib/ai/activities");
  const { sanitizeProposals, findVerbatim } = await import("../lib/ai/extracts");
  const { contentFrom, reconcile } = await import("../lib/ai/snowflake");

  await check("reasoning trace and code fence are stripped", () => {
    const raw = '<think>The user wants JSON. {"not":"this"}</think>\n```json\n{"a":1}\n```';
    const result = parseJsonLoose(raw);
    assert(result.ok, "did not parse");
    assert(
      result.ok && JSON.stringify(result.value) === '{"a":1}',
      `parsed the wrong object: ${JSON.stringify(result.ok && result.value)}`,
    );
    return "answer after </think>, inside the fence";
  });

  await check("an unclosed reasoning trace does not parse", () => {
    const result = parseJsonLoose("<think>still thinking about {");
    assert(!result.ok, "should have failed");
    return "caller retries instead of parsing half a thought";
  });

  await check("a brace inside a quoted string does not end the scan", () => {
    const result = parseJsonLoose('noise {"answer":"use {{1}} here"} trailing');
    assert(result.ok, "did not parse");
    const value = result.ok ? (result.value as { answer: string }) : { answer: "" };
    assert(value.answer === "use {{1}} here", `got ${value.answer}`);
    return "template placeholders survive";
  });

  await check("mcq answered with a letter, with a duplicate option", () => {
    const payload = repairActivity({
      type: "mcq",
      stem: "Q?",
      options: ["Alpha", "Beta", "Alpha", "Gamma"],
      answer: "B",
    });
    assert(payload?.type === "mcq", "dropped");
    assert(payload.options.length === 3, `options ${payload.options.length}`);
    assert(payload.options[payload.answer] === "Beta", "answer did not follow the dedupe");
    return "answer index remapped to Beta";
  });

  await check("mcq with more options than the union allows keeps its answer", () => {
    const payload = repairActivity({
      type: "mcq",
      stem: "Q?",
      options: ["a", "b", "c", "d", "e", "f", "g", "h"],
      answer: 7,
    });
    assert(payload?.type === "mcq", "dropped");
    assert(payload.options.length === 6, `options ${payload.options.length}`);
    assert(payload.options[payload.answer] === "h", "correct option was trimmed away");
    return "capped to 6, correct option retained";
  });

  await check("a fill_blank placeholder with no accepted text is dropped", () => {
    const payload = repairActivity({
      type: "fill_blank",
      template: "A {{1}} and a {{2}}.",
      blanks: [{ id: 1, accepted: ["x"] }],
    });
    assert(payload === null, "was kept, so an answer key was invented");
    return "no answer invented";
  });

  await check("an mcq answer matching nothing is dropped", () => {
    const payload = repairActivity({
      type: "mcq",
      stem: "Q?",
      options: ["a", "b", "c"],
      answer: "Zeta",
    });
    assert(payload === null, "was kept with an unresolvable answer");
    return "no guessed answer key";
  });

  await check("a quote the source does not contain is dropped", () => {
    const markdown = "The note is the pivot between reading and recall, and it is editable.\n";
    const kept = sanitizeProposals(markdown, [
      { exact: "The note is the pivot between reading and recall", priority: 3.6, reason: " x ", concepts: ["Note", "note"] },
      { exact: "a sentence that was never in the source", priority: 10, reason: "y", concepts: [] },
    ]);
    assert(kept.length === 1, `kept ${kept.length}`);
    assert(kept[0].priority === 4, `priority ${kept[0].priority}`);
    assert(kept[0].concepts.length === 1, "concepts not deduped");
    return "hallucinated quote dropped, priority rounded, concepts deduped";
  });

  await check("a collapsed line break still resolves to source characters", () => {
    const markdown = "A queue is a promise that the next\nthing you see matters most.";
    const found = findVerbatim(markdown, "A queue is a promise that the next thing you see matters most.");
    assert(found !== null, "not found");
    assert(found.includes("\n"), "returned the model's whitespace instead of the source's");
    return "newline preserved for B's offsets";
  });

  await check("Cortex answering as an event stream is read", () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"{\\"known\\":"}}]}',
      'data: {"choices":[{"delta":{"content":"[]}"}}]}',
      "data: [DONE]",
    ].join("\n");
    assert(contentFrom(sse) === '{"known":[]}', `got ${contentFrom(sse)}`);
    return "deltas stitched";
  });

  await check("the report cannot invent a concept or misreport untouched", () => {
    const stats = [
      { concept: "FSRS", reviews: 10, recalled: 9, avg_stability: 6, avg_difficulty: 4 },
      { concept: "anchoring", reviews: 0, recalled: 0, avg_stability: 0, avg_difficulty: 0 },
    ];
    const reconciled = reconcile(
      {
        struggling: [{ concept: "blockchain", why: "invented" }, { concept: "FSRS", why: "9 of 10" }],
        known: ["FSRS", "anchoring"],
        untouched: [],
        next_action: "review FSRS",
      },
      stats,
    );
    assert(reconciled.struggling.length === 1, "invented concept survived");
    assert(reconciled.known.length === 0, "a struggling concept was also called known");
    assert(reconciled.untouched.join() === "anchoring", "untouched not recomputed from zero reviews");
    return "invented concept dropped, untouched recomputed";
  });
}

async function runGeneratorChecks(label: string) {
  console.log(`\n${label}`);
  const { AiActivitiesResponse, AiExtractsResponse, AiNoteResponse, DiagnosticsResponse } =
    await import("../lib/api");
  const { loadConceptStats, loadExtracts, loadNote, loadSource } = await import("../lib/ai/data");
  const { proposeExtracts } = await import("../lib/ai/extracts");
  const { draftNote } = await import("../lib/ai/note");
  const { generateActivities } = await import("../lib/ai/activities");
  const { embedPassages, embedQuery, EMBED_DIMS } = await import("../lib/ai/embeddings");
  const { weeklyReport } = await import("../lib/ai/snowflake");
  const { ids } = await import("../lib/seed");

  await check("POST /api/ai/extracts payload", async () => {
    const source = await loadSource(ids.source.fsrs);
    assert(source, "seeded source did not load");
    const { proposals, provider, model } = await proposeExtracts(source);
    AiExtractsResponse.parse(proposals);
    assert(proposals.length > 0, "no proposals");
    for (const proposal of proposals) {
      assert(
        source.markdown.includes(proposal.exact),
        `exact is not verbatim in the source: ${proposal.exact.slice(0, 60)}`,
      );
    }
    return `${proposals.length} proposals, all verbatim, via ${provider}/${model}`;
  });

  await check("POST /api/ai/note payload", async () => {
    const extracts = await loadExtracts([ids.extract(1), ids.extract(2)]);
    assert(extracts.length === 2, `loaded ${extracts.length} extracts`);
    const { draft, provider, model } = await draftNote(extracts);
    AiNoteResponse.parse(draft);
    return `"${draft.title}" via ${provider}/${model}`;
  });

  await check("POST /api/ai/activities payload, all four types", async () => {
    const note = await loadNote(ids.note(1));
    assert(note, "seeded note did not load");
    const types = ["mcq", "select_all", "fill_blank", "closed"] as const;
    const { batch, provider, model } = await generateActivities(note, [...types], 4);
    AiActivitiesResponse.parse(batch);
    for (const activity of batch.activities) {
      assert(types.includes(activity.type), `unrequested type ${activity.type}`);
    }
    return `${batch.activities.length} questions via ${provider}/${model}`;
  });

  await check("embeddings are 768-dim unit vectors", async () => {
    const [vector] = await embedPassages(["the note is the pivot between reading and recall"]);
    assert(vector.length === EMBED_DIMS, `got ${vector.length} dims`);
    const norm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0));
    assert(Math.abs(norm - 1) < 1e-6, `norm ${norm}`);
    const query = await embedQuery("what is the pivot?");
    assert(query.length === EMBED_DIMS, `query got ${query.length} dims`);
    return `${EMBED_DIMS} dims, unit norm, passage and query`;
  });

  await check("GET /api/report payload", async () => {
    const stats = await loadConceptStats();
    assert(stats.length > 0, "no concept stats");
    const { report, provider, model } = await weeklyReport(stats);
    DiagnosticsResponse.parse(report);
    return `${report.struggling.length} struggling, ${report.known.length} known via ${provider}/${model}`;
  });
}

async function runMockOnlyChecks() {
  console.log("\nMock mode specifics");
  const { proposeExtracts } = await import("../lib/ai/extracts");

  await check("a source the fixtures never described still yields proposals", async () => {
    const markdown =
      "# Ingested today\n\nNothing downstream of ingest ever sees a PDF, because every source becomes markdown at ingest time.\n\nA highlight that cannot find itself again is orphaned rather than deleted, which keeps the text.\n";
    const { proposals } = await proposeExtracts({ id: "not-in-the-seed", title: "Fresh", markdown });
    assert(proposals.length > 0, "empty margin rail for a freshly ingested source");
    for (const proposal of proposals) {
      assert(markdown.includes(proposal.exact), "heuristic proposal is not verbatim");
    }
    return `${proposals.length} heuristic proposals`;
  });
}

function runChildPhase(label: string, phaseName: string, extraEnv: Record<string, string>) {
  console.log(`\n--- ${label} (child process) ---`);
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/ai-smoke.ts", `--phase=${phaseName}`],
    {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...extraEnv },
    },
  );
  if (result.status !== 0) failed += 1;
}

async function main() {
  if (phase === "mock") {
    console.log(`AI_MOCK=${process.env.AI_MOCK ?? "(unset, defaults to mock)"}`);
    process.env.AI_MOCK = "1";
    await runUnitChecks();
    await runGeneratorChecks("Mock mode: every route's payload shape");
    await runMockOnlyChecks();

    if (wantsLive) {
      if (!process.env.NVIDIA_API_KEY) {
        console.log(
          "\n--- live phases skipped: NVIDIA_API_KEY is not set in .env.local ---\n" +
            "    Paste the key, then: npm run smoke:ai -- --live",
        );
      } else {
        runChildPhase("Live NVIDIA", "live", { AI_MOCK: "0" });
        if (process.env.DO_INFERENCE_KEY) {
          runChildPhase("Failover to DigitalOcean (NVIDIA key deliberately broken)", "live", {
            AI_MOCK: "0",
            NVIDIA_API_KEY: "sk-invalid-on-purpose",
          });
        } else {
          console.log(
            "\n--- failover phase skipped: DO_INFERENCE_KEY is not set ---\n" +
              "    Without it the client runs NVIDIA-only, which is the documented degradation.",
          );
        }
      }
    } else {
      console.log("\nPass --live to add real model calls and a forced failover.");
    }
  } else {
    process.env.AI_MOCK = "0";
    await runGeneratorChecks("Live: every route's payload shape");
  }

  console.log(
    failed === 0
      ? "\nAll checks passed.\n"
      : `\n${failed} check${failed === 1 ? "" : "s"} failed.\n`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
