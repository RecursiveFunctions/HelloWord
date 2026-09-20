import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dueQueue } from "@/lib/fsrs/queue";
import { notes as seedNotes } from "@/lib/seed";
import { resetMemory } from "./memory";
import { updateNote } from "./notes";
import { createActivities, getSchedule } from "./review";

afterEach(() => resetMemory());

describe("generated activity persistence", () => {
  it("persists selected payloads against the note body hash", async () => {
    const note = seedNotes[0];
    const payload = {
      type: "closed" as const,
      stem: "What makes a reading queue useful?",
      answer: "It prioritizes the next unread material.",
      accepted: [],
    };

    const [created] = await createActivities(note.id, note.body_hash, [payload]);

    assert.equal(created.note_id, note.id);
    assert.equal(created.source_body_hash, note.body_hash);
    assert.deepEqual(created.payload, payload);
    assert.equal(await getSchedule(created.id), null);
  });

  it("makes unscheduled generated activities immediately reviewable", async () => {
    const note = seedNotes[0];
    const [created] = await createActivities(note.id, note.body_hash, [
      {
        type: "closed",
        stem: "What is the main idea?",
        answer: "Prioritize the next useful item.",
        accepted: [],
      },
    ]);

    const queue = await dueQueue({ now: new Date("2030-01-01T00:00:00.000Z") });
    const card = queue.find(({ activity }) => activity.id === created.id);

    assert.ok(card);
    assert.equal(card.stale, false);
    assert.equal(card.noteTitle, note.title);
  });

  it("marks an activity stale after its note body changes", async () => {
    const note = seedNotes[0];
    const [created] = await createActivities(note.id, note.body_hash, [
      {
        type: "closed",
        stem: "What is the original main idea?",
        answer: "Prioritize the next useful item.",
        accepted: [],
      },
    ]);

    const updated = await updateNote(note.id, {
      body_md: `${note.body_md}\n\nA substantive edit changes the canonical body hash.`,
    });
    assert.ok(updated);
    assert.notEqual(updated.body_hash, note.body_hash);

    const queue = await dueQueue({ now: new Date("2030-01-01T00:00:00.000Z") });
    const card = queue.find(({ activity }) => activity.id === created.id);

    assert.ok(card);
    assert.equal(card.stale, true);
  });
});