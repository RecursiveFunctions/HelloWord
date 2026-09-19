import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JSONContent } from "@tiptap/core";
import { notes } from "../seed/data";
import { docToMarkdown, markdownToHtml } from "./markdown";

const text = (value: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

const para = (...content: JSONContent[]): JSONContent => ({
  type: "paragraph",
  content,
});

const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("markdownToHtml", () => {
  it("renders block structure", () => {
    const html = markdownToHtml("# Title\n\nA paragraph.\n\n- one\n- two\n");
    assert.equal(
      html,
      "<h1>Title</h1><p>A paragraph.</p><ul><li><p>one</p></li><li><p>two</p></li></ul>",
    );
  });

  it("renders inline marks", () => {
    assert.equal(markdownToHtml("**bold** and *italic*\n"), "<p><strong>bold</strong> and <em>italic</em></p>");
    assert.equal(markdownToHtml("use `code` here\n"), "<p>use <code>code</code> here</p>");
    assert.equal(markdownToHtml("~~gone~~\n"), "<p><s>gone</s></p>");
  });

  it("leaves intraword underscores alone", () => {
    assert.equal(markdownToHtml("request_retention is a knob\n"), "<p>request_retention is a knob</p>");
  });

  it("escapes HTML rather than passing it through", () => {
    assert.equal(
      markdownToHtml("<script>alert(1)</script>\n"),
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("refuses to render a javascript: link as a link", () => {
    const html = markdownToHtml("[click](javascript:alert(1))\n");
    assert.ok(!html.includes("<a"), html);
  });

  it("does not treat markdown inside a code span as syntax", () => {
    assert.equal(markdownToHtml("`**not bold**`\n"), "<p><code>**not bold**</code></p>");
  });

  it("returns an empty paragraph for empty input so Tiptap has a cursor", () => {
    assert.equal(markdownToHtml(""), "<p></p>");
  });
});

describe("docToMarkdown", () => {
  it("serializes headings, paragraphs, and lists", () => {
    const result = docToMarkdown(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
        para(text("Body text.")),
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [para(text("one"))] },
            { type: "listItem", content: [para(text("two"))] },
          ],
        },
      ),
    );
    assert.equal(result, "## Title\n\nBody text.\n\n- one\n- two\n");
  });

  it("numbers ordered lists from their start attribute", () => {
    const result = docToMarkdown(
      doc({
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          { type: "listItem", content: [para(text("third"))] },
          { type: "listItem", content: [para(text("fourth"))] },
        ],
      }),
    );
    assert.equal(result, "3. third\n4. fourth\n");
  });

  it("serializes marks, with code left literal", () => {
    assert.equal(
      docToMarkdown(doc(para(text("bold", [{ type: "bold" }])))),
      "**bold**\n",
    );
    assert.equal(
      docToMarkdown(doc(para(text("a*b", [{ type: "code" }])))),
      "`a*b`\n",
      "code content must not be escaped",
    );
    assert.equal(
      docToMarkdown(doc(para(text("site", [{ type: "link", attrs: { href: "https://x.test" } }])))),
      "[site](https://x.test)\n",
    );
  });

  it("drops a javascript: href instead of serializing it", () => {
    assert.equal(
      docToMarkdown(doc(para(text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])))),
      "x\n",
    );
  });

  it("escapes characters that would be read back as syntax", () => {
    assert.equal(docToMarkdown(doc(para(text("2 * 3 * 4")))), "2 \\* 3 \\* 4\n");
  });

  it("serializes blockquotes and fenced code", () => {
    assert.equal(
      docToMarkdown(doc({ type: "blockquote", content: [para(text("quoted"))] })),
      "> quoted\n",
    );
    assert.equal(
      docToMarkdown(
        doc({ type: "codeBlock", attrs: { language: "ts" }, content: [text("const x = 1;")] }),
      ),
      "```ts\nconst x = 1;\n```\n",
    );
  });

  it("uses a backslash hard break, which survives normalization", () => {
    const result = docToMarkdown(doc(para(text("one"), { type: "hardBreak" }, text("two"))));
    assert.equal(result, "one\\\ntwo\n");
    assert.ok(!result.includes("  \n"), "trailing-space breaks would be stripped");
  });

  it("is idempotent on an already-normalized body", () => {
    const once = docToMarkdown(doc(para(text("Stable body.")), para(text("Second."))));
    const twice = docToMarkdown(doc(para(text("Stable body.")), para(text("Second."))));
    assert.equal(once, twice, "an unchanged doc must not churn body_hash");
  });

  it("round-trips every seeded note body through HTML and back", () => {
    for (const note of notes) {
      const html = markdownToHtml(note.body_md);
      assert.ok(html.startsWith("<p>") || html.startsWith("<h"), note.title);
      // Seeded notes are single plain paragraphs, so the text must survive intact.
      const stripped = html.replace(/<[^>]+>/g, "");
      assert.equal(stripped, note.body_md.trim(), `note "${note.title}" lost text`);
    }
  });
});
