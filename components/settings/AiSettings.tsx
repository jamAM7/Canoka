"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** Whether an Anthropic API key is saved on this machine. Never the key itself. */
  hasKey: boolean;
}

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary-light focus:shadow-focus focus:outline-none";
const PRIMARY_BUTTON =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50";

// Settings › AI: the Anthropic API key that AI review of notes runs on.
export function AiSettings({ hasKey }: Props) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ai/key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error, error: true });
        return;
      }
      setKey("");
      setMessage({ text: "Saved.", error: false });
      router.refresh();
    } catch {
      setMessage({ text: "Couldn't reach the app's server.", error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-text">AI</h2>
      <form onSubmit={save} className="mt-4 max-w-xl space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-text">Anthropic API key</span>
          <input
            type="password"
            className={FIELD}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setMessage(null);
            }}
            placeholder={hasKey ? "Saved. Paste a new one to replace it." : "sk-ant-…"}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="mt-1 block text-xs text-text-muted">
            Reviews your notes for a week with Claude. Make a key at console.anthropic.com. It&apos;s saved in
            llm/.env on this computer.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!key.trim() || saving} className={PRIMARY_BUTTON}>
            Save
          </button>
          {message && (
            <span className={`text-sm ${message.error ? "text-error" : "text-success"}`}>{message.text}</span>
          )}
        </div>
      </form>
    </section>
  );
}
