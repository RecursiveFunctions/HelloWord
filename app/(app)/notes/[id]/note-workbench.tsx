"use client";

import { useEffect, useState } from "react";
import { ActivityDraftList } from "@/components/activity-draft-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readJson } from "@/lib/client/json";
import type { ActivityPayload } from "@/lib/contracts/activity";
import { normalizeMarkdown } from "@/lib/contracts/markdown";
import type { NoteRow } from "@/lib/store/types";
import { NoteEditor } from "../../read/[id]/note-editor";
import "../../read/[id]/reader.css";

/**
 * A note on its own: edit the markdown, then run the activity pipeline on it.
 * Drafts are previewed here and only reach the review queue once accepted, the
 * same flow the source reader uses.
 */
export function NoteWorkbench({ initialNote }: { initialNote: NoteRow }) {
  const [note, setNote] = useState(initialNote);
  const [title, setTitle] = useState(initialNote.title);
  const [body, setBody] = useState(initialNote.body_md);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>();

  const [drafts, setDrafts] = useState<ActivityPayload[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [activityStatus, setActivityStatus] = useState<string>();

  // The server normalizes the body on save, so compare like with like or a
  // just-saved note would read as edited.
  const dirty = title !== note.title || normalizeMarkdown(body) !== note.body_md;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(): Promise<NoteRow | null> {
    setSaving(true);
    setSaveStatus(undefined);
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() || note.title, body_md: body }),
      });
      const saved = await readJson<NoteRow | { error?: string }>(
        response,
        "Could not save note.",
      );
      if (!response.ok || !("id" in saved)) {
        throw new Error("error" in saved && saved.error ? saved.error : "Could not save note.");
      }
      setNote(saved);
      setTitle(saved.title);
      if (drafts.length) {
        setDrafts([]);
        setSelected(new Set());
        setActivityStatus("Note changed, so the earlier drafts were cleared.");
      }
      setSaveStatus("Saved.");
      return saved;
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Could not save note.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    let current = note;
    if (dirty) {
      const saved = await save();
      if (!saved) return;
      current = saved;
    }
    if (!current.body_md.trim()) {
      setActivityStatus("Write something in the note first.");
      return;
    }
    setGenerating(true);
    setActivityStatus(undefined);
    try {
      const response = await fetch("/api/ai/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          noteId: current.id,
          types: ["mcq", "select_all", "fill_blank", "closed"],
          count: 4,
        }),
      });
      const result = await readJson<{
        activities?: ActivityPayload[];
        error?: string;
        detail?: string;
      }>(response, "Could not generate activities.");
      if (!response.ok || !result.activities) {
        throw new Error(result.detail || result.error || "Could not generate activities.");
      }
      setDrafts(result.activities);
      setSelected(new Set(result.activities.map((_, index) => index)));
      setActivityStatus(`${result.activities.length} drafts ready. Select the ones to keep.`);
    } catch (error) {
      setActivityStatus(error instanceof Error ? error.message : "Could not generate activities.");
    } finally {
      setGenerating(false);
    }
  }

  async function accept() {
    const chosen = drafts.filter((_, index) => selected.has(index));
    if (!chosen.length) return;
    setAccepting(true);
    setActivityStatus(undefined);
    try {
      const response = await fetch("/api/ai/activities/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          note_id: note.id,
          source_body_hash: note.body_hash,
          activities: chosen,
        }),
      });
      const result = await readJson<{ activities?: unknown[]; error?: string }>(
        response,
        "Could not accept activities.",
      );
      if (!response.ok || !result.activities) {
        throw new Error(result.error || "Could not accept activities.");
      }
      setDrafts([]);
      setSelected(new Set());
      setActivityStatus(`${result.activities.length} activities added to the review queue.`);
    } catch (error) {
      setActivityStatus(error instanceof Error ? error.message : "Could not accept activities.");
    } finally {
      setAccepting(false);
    }
  }

  function toggle(index: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
      <section
        className="min-w-0 space-y-3"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "s") {
            event.preventDefault();
            if (dirty && !saving) void save();
          }
        }}
      >
        <div className="flex items-center gap-3">
          <Input
            aria-label="Note title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-11 text-base"
          />
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <NoteEditor body={body} onBodyChange={setBody} disabled={saving} />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {saveStatus ?? (dirty ? "Unsaved changes." : "All changes saved.")}
        </p>
      </section>

      <aside className="min-w-0 space-y-4 rounded-xl border bg-card p-4 lg:self-start">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg">Activities</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Generated from this note. Previewed before anything is saved.
            </p>
          </div>
          <Button onClick={() => void generate()} disabled={generating || saving || accepting}>
            {generating ? "Thinking…" : drafts.length ? "Regenerate" : "Generate"}
          </Button>
        </div>
        {activityStatus ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {activityStatus}
          </p>
        ) : null}
        <ActivityDraftList
          className="space-y-3"
          activities={drafts}
          selected={selected}
          onToggle={toggle}
        />
        {drafts.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              onClick={() => void accept()}
              disabled={accepting || selected.size === 0}
            >
              {accepting ? "Adding…" : `Add ${selected.size} to review`}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={accepting}
              onClick={() => {
                setDrafts([]);
                setSelected(new Set());
                setActivityStatus("Drafts cleared.");
              }}
            >
              Reject all
            </Button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
