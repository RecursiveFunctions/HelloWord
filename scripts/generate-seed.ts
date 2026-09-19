import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  activities,
  conceptExtracts,
  conceptNotes,
  concepts,
  extractNotes,
  extracts,
  notebookItems,
  notebooks,
  notes,
  quizsetActivities,
  quizsets,
  schedulerProfile,
  schedules,
  sources,
} from "../lib/seed/data";
import { generateReviewEvents } from "../lib/seed/reviews";

const root = join(__dirname, "..");

function sqlStr(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlTs(value: string): string {
  return `${sqlStr(value)}::timestamptz`;
}

function sqlJson(value: unknown): string {
  return `${sqlStr(JSON.stringify(value))}::jsonb`;
}

function sqlTextArray(values: string[]): string {
  return `ARRAY[${values.map(sqlStr).join(", ")}]::text[]`;
}

const lines: string[] = [
  "-- Generated from lib/seed/*. Do not hand-edit; run `npm run db:generate-seed`.",
  "-- Apply after db/schema.sql. Safe to re-run only on an empty database.",
  "",
  "insert into scheduler_profile (id, name, request_retention, maximum_interval, learning_steps, relearning_steps, enable_fuzz, interval_modifier, day_ms, created_at) values (",
  `  ${sqlStr(schedulerProfile.id)}, ${sqlStr(schedulerProfile.name)}, ${schedulerProfile.request_retention}, ${schedulerProfile.maximum_interval}, ${sqlTextArray(schedulerProfile.learning_steps)}, ${sqlTextArray(schedulerProfile.relearning_steps)}, ${schedulerProfile.enable_fuzz}, ${schedulerProfile.interval_modifier}, ${schedulerProfile.day_ms}, ${sqlTs(schedulerProfile.created_at)}`,
  ");",
  "",
];

lines.push("insert into notebook (id, name, description, color, created_at) values");
lines.push(
  notebooks
    .map(
      (n) =>
        `  (${sqlStr(n.id)}, ${sqlStr(n.name)}, ${sqlStr(n.description)}, ${sqlStr(n.color)}, ${sqlTs(n.created_at)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push("insert into source (id, kind, title, origin_uri, storage_key, markdown, ingest_status, ingest_method, word_count, created_at) values");
lines.push(
  sources
    .map(
      (s) =>
        `  (${sqlStr(s.id)}, ${sqlStr(s.kind)}, ${sqlStr(s.title)}, ${sqlStr(s.origin_uri)}, ${sqlStr(s.storage_key)}, ${sqlStr(s.markdown)}, ${sqlStr(s.ingest_status)}, ${sqlStr(s.ingest_method)}, ${s.word_count}, ${sqlTs(s.created_at)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push("insert into note (id, title, body_md, body_hash, origin, created_at, updated_at) values");
lines.push(
  notes
    .map(
      (n) =>
        `  (${sqlStr(n.id)}, ${sqlStr(n.title)}, ${sqlStr(n.body_md)}, ${sqlStr(n.body_hash)}, ${sqlStr(n.origin)}, ${sqlTs(n.created_at)}, ${sqlTs(n.updated_at)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push("insert into extract (id, source_id, body_md, priority, selector, anchor_status, suggested_by, accepted, created_at) values");
lines.push(
  extracts
    .map(
      (e) =>
        `  (${sqlStr(e.id)}, ${sqlStr(e.source_id)}, ${sqlStr(e.body_md)}, ${e.priority}, ${sqlJson(e.selector)}, ${sqlStr(e.anchor_status)}, ${sqlStr(e.suggested_by)}, ${e.accepted}, ${sqlTs(e.created_at)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push("insert into extract_note (extract_id, note_id) values");
lines.push(extractNotes.map((r) => `  (${sqlStr(r.extract_id)}, ${sqlStr(r.note_id)})`).join(",\n") + ";");
lines.push("");

lines.push("insert into concept (id, label) values");
lines.push(concepts.map((c) => `  (${sqlStr(c.id)}, ${sqlStr(c.label)})`).join(",\n") + ";");
lines.push("");

lines.push("insert into concept_note (concept_id, note_id) values");
lines.push(conceptNotes.map((r) => `  (${sqlStr(r.concept_id)}, ${sqlStr(r.note_id)})`).join(",\n") + ";");
lines.push("");

lines.push("insert into concept_extract (concept_id, extract_id) values");
lines.push(conceptExtracts.map((r) => `  (${sqlStr(r.concept_id)}, ${sqlStr(r.extract_id)})`).join(",\n") + ";");
lines.push("");

lines.push("insert into activity (id, note_id, type, payload, source_body_hash, variant_of, created_at) values");
lines.push(
  activities
    .map(
      (a) =>
        `  (${sqlStr(a.id)}, ${sqlStr(a.note_id)}, ${sqlStr(a.type)}, ${sqlJson(a.payload)}, ${sqlStr(a.source_body_hash)}, NULL, ${sqlTs(a.created_at)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push("insert into schedule (activity_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, a_factor) values");
lines.push(
  schedules
    .map(
      (s) =>
        `  (${sqlStr(s.activity_id)}, ${sqlTs(s.due)}, ${s.stability}, ${s.difficulty}, ${s.elapsed_days}, ${s.scheduled_days}, ${s.learning_steps}, ${s.reps}, ${s.lapses}, ${s.state}, ${s.last_review ? sqlTs(s.last_review) : "NULL"}, ${s.a_factor})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push("insert into notebook_item (notebook_id, item_type, item_id, added_at) values");
lines.push(
  notebookItems
    .map(
      (i) =>
        `  (${sqlStr(i.notebook_id)}, ${sqlStr(i.item_type)}, ${sqlStr(i.item_id)}, ${sqlTs(i.added_at)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push("insert into quizset (id, name, kind, created_at) values");
lines.push(
  quizsets
    .map((q) => `  (${sqlStr(q.id)}, ${sqlStr(q.name)}, ${sqlStr(q.kind)}, ${sqlTs(q.created_at)})`)
    .join(",\n") + ";",
);
lines.push("");

lines.push("insert into quizset_activity (quizset_id, activity_id, position) values");
lines.push(
  quizsetActivities
    .map((r) => `  (${sqlStr(r.quizset_id)}, ${sqlStr(r.activity_id)}, ${r.position})`)
    .join(",\n") + ";",
);
lines.push("");

const events = generateReviewEvents();
lines.push(`-- ${events.length} synthetic review_event rows covering 90 days`);
lines.push("insert into review_event (time, activity_id, note_id, concept_id, rating, state, elapsed_days, scheduled_days, stability, difficulty, duration_ms, mode) values");
lines.push(
  events
    .map(
      (e) =>
        `  (${sqlTs(e.time)}, ${sqlStr(e.activity_id)}, ${sqlStr(e.note_id)}, ${sqlStr(e.concept_id)}, ${e.rating}, ${e.state}, ${e.elapsed_days}, ${e.scheduled_days}, ${e.stability}, ${e.difficulty}, ${e.duration_ms}, ${sqlStr(e.mode)})`,
    )
    .join(",\n") + ";",
);
lines.push("");
lines.push("refresh materialized view review_daily;");
lines.push("");

writeFileSync(join(root, "db", "seed.sql"), lines.join("\n"), "utf8");
console.log(`Wrote db/seed.sql (${events.length} review events, ${activities.length} activities)`);
