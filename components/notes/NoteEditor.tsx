"use client";

import { useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { noteText, type Note } from "@/lib/notes/storage";
import {
  BulletListIcon,
  ChevronIcon,
  CodeIcon,
  NumberedListIcon,
  QuoteIcon,
  TableIcon,
} from "@/components/shell/icons";

interface Props {
  note: Note;
  onChange: (patch: Partial<Note>) => void;
  onDelete: () => void;
}

// Fixed, so the editor isn't reconfigured on every keystroke.
const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
  TableKit.configure({ table: { resizable: true } }),
  Placeholder.configure({ placeholder: "Start typing your notes…" }),
];
const EDITOR_PROPS = { attributes: { class: "note-editor-content", "aria-label": "Note content" } };

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

// The open note: its title, and its text in a rich-text editor (TipTap) with
// basic formatting and tables, saved as HTML. Markdown-style typing works too:
// "# " starts a heading, "- " a list, "> " a quote, **bold** and *italic*.
// Render with key={note.id}, so the editor and delete confirmation start fresh per note.
export function NoteEditor({ note, onChange, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The editor owns the text once the note is open.
  const [initialContent] = useState(note.content);
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: initialContent,
    editorProps: EDITOR_PROPS,
    // Notes load after mount, so this only ever renders in the browser.
    immediatelyRender: true,
    onUpdate: ({ editor }) => onChange({ content: editor.getHTML() }),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      heading: ([1, 2, 3] as const).find((level) => editor.isActive("heading", { level })),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      blockquote: editor.isActive("blockquote"),
      inTable: editor.isActive("table"),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <>
      <div className="note-editor-toolbar">
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
          <Tool label="Bold" keys="Mod+B" active={state.bold} onClick={() => chain().toggleBold().run()}>
            <span className="font-bold">B</span>
          </Tool>
          <Tool label="Italic" keys="Mod+I" active={state.italic} onClick={() => chain().toggleItalic().run()}>
            <span className="font-serif italic">I</span>
          </Tool>
          <Tool
            label="Underline"
            keys="Mod+U"
            active={state.underline}
            onClick={() => chain().toggleUnderline().run()}
          >
            <span className="underline underline-offset-2">U</span>
          </Tool>
          <Tool
            label="Strikethrough"
            keys="Mod+Shift+S"
            active={state.strike}
            onClick={() => chain().toggleStrike().run()}
          >
            <span className="line-through">S</span>
          </Tool>
          <Tool label="Code" keys="Mod+E" active={state.code} onClick={() => chain().toggleCode().run()}>
            <CodeIcon />
          </Tool>
          <Divider />
          {([1, 2, 3] as const).map((level) => (
            <Tool
              key={level}
              label={`Heading ${level}`}
              keys={`Mod+Alt+${level}`}
              active={state.heading === level}
              onClick={() => chain().toggleHeading({ level }).run()}
            >
              <span className="text-xs font-bold">H{level}</span>
            </Tool>
          ))}
          <Divider />
          <Tool
            label="Bulleted list"
            keys="Mod+Shift+8"
            active={state.bulletList}
            onClick={() => chain().toggleBulletList().run()}
          >
            <BulletListIcon />
          </Tool>
          <Tool
            label="Numbered list"
            keys="Mod+Shift+7"
            active={state.orderedList}
            onClick={() => chain().toggleOrderedList().run()}
          >
            <NumberedListIcon />
          </Tool>
          <Tool
            label="Quote"
            keys="Mod+Shift+B"
            active={state.blockquote}
            onClick={() => chain().toggleBlockquote().run()}
          >
            <QuoteIcon />
          </Tool>
          <Divider />
          <TableTool editor={editor} inTable={state.inTable} />
        </div>

        {confirmDelete ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-sm text-text">Delete this note?</span>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md bg-error px-3 py-1.5 text-sm font-medium text-white hover:bg-error/90"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-md px-2 py-1.5 text-sm font-medium text-error hover:bg-error/10"
          >
            Delete note
          </button>
        )}
      </div>

      <input
        className="note-editor-title"
        value={note.title}
        onChange={(e) => onChange({ title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          editor.commands.focus("start");
        }}
        placeholder="Untitled"
        aria-label="Note title"
        // A new, empty note opens with the cursor in its title.
        autoFocus={!note.title && !noteText(note.content).trim()}
      />
      <EditorContent editor={editor} />
    </>
  );
}

/** Inserts a table, or once the cursor is in one, opens a menu to change it. */
function TableTool({ editor, inTable }: { editor: Editor; inTable: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const chain = () => editor.chain().focus();
  const item = (label: string, command: () => boolean, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        command();
        setMenuOpen(false);
      }}
      className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
        danger ? "text-error hover:bg-error/10" : "text-text hover:bg-surface-muted"
      }`}
    >
      {label}
    </button>
  );

  if (!inTable) {
    return (
      <Tool
        label="Insert table"
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon />
      </Tool>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        title="Table"
        aria-label="Table"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenuOpen((o) => !o)}
        className="flex h-8 items-center gap-0.5 rounded-md bg-primary-light/25 px-1.5 text-primary"
      >
        <TableIcon />
        <ChevronIcon dir="right" className="rotate-90" />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div
            role="menu"
            className="absolute left-0 z-20 mt-1 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-md"
          >
            {item("Add row above", () => chain().addRowBefore().run())}
            {item("Add row below", () => chain().addRowAfter().run())}
            {item("Add column left", () => chain().addColumnBefore().run())}
            {item("Add column right", () => chain().addColumnAfter().run())}
            {item("Toggle header row", () => chain().toggleHeaderRow().run())}
            <div className="my-1 h-px bg-border-light" />
            {item("Delete row", () => chain().deleteRow().run(), true)}
            {item("Delete column", () => chain().deleteColumn().run(), true)}
            {item("Delete table", () => chain().deleteTable().run(), true)}
          </div>
        </>
      )}
    </div>
  );
}

function Tool({
  label,
  keys,
  active = false,
  onClick,
  children,
}: {
  label: string;
  /** The keyboard shortcut, e.g. "Mod+Shift+S". Mod is ⌘ on a Mac and Ctrl elsewhere. */
  keys?: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={keys ? `${label} (${shortcut(keys)})` : label}
      aria-label={label}
      aria-pressed={active}
      // Keep the cursor where it is in the note rather than moving focus to the button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-sm transition-colors ${
        active ? "bg-primary-light/25 text-primary" : "text-text-muted hover:bg-surface-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

function shortcut(keys: string): string {
  return IS_MAC
    ? keys.replace("Mod+", "⌘").replace("Shift+", "⇧").replace("Alt+", "⌥")
    : keys.replace("Mod+", "Ctrl+");
}
