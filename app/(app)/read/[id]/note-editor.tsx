"use client";

import { useEffect, useState } from "react";
import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { markdownToHtml, docToMarkdown } from "@/lib/editor/markdown";
import { cn } from "@/lib/utils";

/**
 * Icons, not words. The toolbar is a fixed grid of square buttons, so a label
 * like "Code block" cannot fit inside one and spills over its neighbours. The
 * name lives in `aria-label` and `title` instead, where it stays readable to
 * screen readers and on hover without taking any width.
 */
function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? "secondary" : "ghost"}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className="size-8 shrink-0"
    >
      <Icon className="size-4" aria-hidden />
    </Button>
  );
}

/**
 * Which marks are on under the caret, recomputed per transaction.
 *
 * Tiptap 3's `useEditor` does not re-render on transactions, so reading
 * `editor.isActive(...)` straight from render leaves the toolbar showing the
 * state it had when the note loaded. `useEditorState` subscribes properly.
 */
function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            h1: current.isActive("heading", { level: 1 }),
            h2: current.isActive("heading", { level: 2 }),
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            strike: current.isActive("strike"),
            code: current.isActive("code"),
            bulletList: current.isActive("bulletList"),
            orderedList: current.isActive("orderedList"),
            blockquote: current.isActive("blockquote"),
            codeBlock: current.isActive("codeBlock"),
            canUndo: current.can().chain().undo().run(),
            canRedo: current.can().chain().redo().run(),
          }
        : null,
  });
}

export function NoteEditor({
  body,
  onBodyChange,
  disabled = false,
}: {
  body: string;
  onBodyChange: (body: string) => void;
  disabled?: boolean;
}) {
  // Rendered once, from the body as it was on mount. Later edits reach the
  // editor through the sync effect below, not by re-seeding its content.
  const [initialContent] = useState(() => markdownToHtml(body));
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    immediatelyRender: false,
    editable: !disabled,
    onUpdate: ({ editor: nextEditor }) => {
      onBodyChange(docToMarkdown(nextEditor.getJSON()));
    },
  });
  const toolbar = useToolbarState(editor);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || body === docToMarkdown(editor.getJSON())) return;
    const currentSelection = editor.state.selection;
    editor.commands.setContent(markdownToHtml(body), { emitUpdate: false });
    editor.commands.setTextSelection({
      from: Math.min(currentSelection.from, editor.state.doc.content.size),
      to: Math.min(currentSelection.to, editor.state.doc.content.size),
    });
  }, [body, editor]);

  if (!editor || !toolbar) {
    return <div className="min-h-44 rounded-md border bg-background p-3 text-sm text-muted-foreground">Loading editor…</div>;
  }

  return (
    <div className={cn("rounded-md border bg-background", disabled && "opacity-70")}>
      <div className="flex flex-wrap gap-0.5 border-b p-1" role="toolbar" aria-label="Note formatting">
        <ToolbarButton icon={Heading1} label="Heading 1" active={toolbar.h1} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
        <ToolbarButton icon={Heading2} label="Heading 2" active={toolbar.h2} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarButton icon={Bold} label="Bold" active={toolbar.bold} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton icon={Italic} label="Italic" active={toolbar.italic} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton icon={Strikethrough} label="Strikethrough" active={toolbar.strike} disabled={disabled} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ToolbarButton icon={Code} label="Inline code" active={toolbar.code} disabled={disabled} onClick={() => editor.chain().focus().toggleCode().run()} />
        <ToolbarButton icon={List} label="Bullet list" active={toolbar.bulletList} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton icon={ListOrdered} label="Numbered list" active={toolbar.orderedList} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton icon={Quote} label="Blockquote" active={toolbar.blockquote} disabled={disabled} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton icon={SquareCode} label="Code block" active={toolbar.codeBlock} disabled={disabled} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <ToolbarButton icon={Minus} label="Horizontal rule" disabled={disabled} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <ToolbarButton icon={Undo2} label="Undo" disabled={disabled || !toolbar.canUndo} onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton icon={Redo2} label="Redo" disabled={disabled || !toolbar.canRedo} onClick={() => editor.chain().focus().redo().run()} />
      </div>
      <EditorContent
        editor={editor}
        aria-label="Note markdown editor"
        className="note-editor-content min-h-44 px-3 py-2 text-sm"
      />
    </div>
  );
}
