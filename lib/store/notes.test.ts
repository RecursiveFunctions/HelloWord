import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedFile } from "../client/upload";
import { createNote, getNote } from "./notes";

const memoryOnly = !process.env.DATABASE_URL;

test("createNote stores a human note with a body hash", { skip: !memoryOnly }, async () => {
  const note = await createNote({ title: "  Hello  ", body_md: "# Hi\r\n\r\ntext" });
  assert.equal(note.title, "Hello");
  assert.equal(note.origin, "human");
  assert.ok(note.body_hash.length > 0);
  assert.equal((await getNote(note.id))?.id, note.id);
});

test("createNote falls back to a default title", { skip: !memoryOnly }, async () => {
  assert.equal((await createNote({ title: "   " })).title, "Untitled note");
});

test("isSupportedFile accepts pdf, md, txt only", () => {
  const f = (name: string, type = "") => new File(["x"], name, { type });
  assert.ok(isSupportedFile(f("a.pdf", "application/pdf")));
  assert.ok(isSupportedFile(f("a.MD")));
  assert.ok(isSupportedFile(f("a.txt")));
  assert.ok(!isSupportedFile(f("a.docx")));
  assert.ok(!isSupportedFile(f("a.png", "image/png")));
});
