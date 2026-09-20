"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import { markdownToHtml, docToMarkdown } from "@/lib/editor/markdown";
import { cn } from "@/lib/utils";

function ToolbarButton({
  editor,
  label,
  active,
  disabled,
  onClick,
}: {
  editor: Editor;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className="size-8 px-0 text-xs"
    >
      {label}
    </Button>
  );
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
  const initialBody = useRef(body);
  const editor = useEditor({
    extensions: [StarterKit],
    content: markdownToHtml(initialBody.current),
    immediatelyRender: false,
    editable: !disabled,
    onUpdate: ({ editor: nextEditor }) => {
      onBodyChange(docToMarkdown(nextEditor.getJSON()));
    },
  });

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

  if (!editor) {
    return <div className="min-h-44 rounded-md border bg-background p-3 text-sm text-muted-foreground">Loading editor…</div>;
  }

  const canUndo = editor.can().chain().undo().run();
  const canRedo = editor.can().chain().redo().run();

  return (
    <div className={cn("rounded-md border bg-background", disabled && "opacity-70")}>
      <div className="flex flex-wrap gap-1 border-b p-1" role="toolbar" aria-label="Note formatting">
        <ToolbarButton editor={editor} label="H1" active={editor.isActive("heading", { level: 1 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
        <ToolbarButton editor={editor} label="H2" active={editor.isActive("heading", { level: 2 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarButton editor={editor} label="B" active={editor.isActive("bold")} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton editor={editor} label="I" active={editor.isActive("italic")} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton editor={editor} label="S" active={editor.isActive("strike")} disabled={disabled} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ToolbarButton editor={editor} label="Code" active={editor.isActive("code")} disabled={disabled} onClick={() => editor.chain().focus().toggleCode().run()} />
        <ToolbarButton editor={editor} label="• List" active={editor.isActive("bulletList")} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton editor={editor} label="1. List" active={editor.isActive("orderedList")} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton editor={editor} label="Quote" active={editor.isActive("blockquote")} disabled={disabled} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton editor={editor} label="Code block" active={editor.isActive("codeBlock")} disabled={disabled} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <ToolbarButton editor={editor} label="Rule" disabled={disabled} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <ToolbarButton editor={editor} label="Undo" disabled={disabled || !canUndo} onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton editor={editor} label="Redo" disabled={disabled || !canRedo} onClick={() => editor.chain().focus().redo().run()} />
      </div>
      <EditorContent
        editor={editor}
        aria-label="Note markdown editor"
        className="note-editor-content min-h-44 px-3 py-2 text-sm"
      />
    </div>
  );
}
