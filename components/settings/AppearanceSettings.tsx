"use client";

import { useEffect, useId, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Preferences,
  type TextSize,
  type Theme,
} from "@/lib/ui/preferences";

const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Match this device" },
  { value: "light", label: "Light", hint: "Dark text on light" },
  { value: "dark", label: "Dark", hint: "Light text on dark" },
];

const TEXT_SIZES: { value: TextSize; label: string; scale: number }[] = [
  { value: "default", label: "Default", scale: 1 },
  { value: "large", label: "Large", scale: 1.125 },
  { value: "larger", label: "Larger", scale: 1.25 },
  { value: "largest", label: "Largest", scale: 1.5 },
];

const TOGGLES: { key: "highContrast" | "reduceMotion" | "wideSpacing" | "underlineLinks"; label: string; hint: string }[] = [
  {
    key: "highContrast",
    label: "High contrast",
    hint: "Stronger text, borders and focus outlines. Works with light and dark.",
  },
  {
    key: "reduceMotion",
    label: "Reduce motion",
    hint: "Turns off animations and sliding panels. On already if your device asks for it.",
  },
  {
    key: "wideSpacing",
    label: "Wider text spacing",
    hint: "More space between letters, words and lines. Can help with low vision and dyslexia.",
  },
  {
    key: "underlineLinks",
    label: "Underline links",
    hint: "So links stand out by more than colour.",
  },
];

const OPTION =
  "flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text transition-colors hover:border-primary-light has-[:checked]:border-primary has-[:checked]:bg-primary/10";
const SECONDARY_BUTTON =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted";

// Settings › Appearance: dark mode and features for low-vision students.
// Changes apply straight away and are kept in this browser (lib/ui/preferences).
export function AppearanceSettings() {
  const uid = useId();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [status, setStatus] = useState("");

  // localStorage only exists in the browser, so read it after mount.
  useEffect(() => setPrefs(loadPreferences()), []);

  function update(patch: Partial<Preferences>, announce: string) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePreferences(next);
    setStatus(announce);
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="text-xl font-semibold text-text">
        Appearance &amp; accessibility
      </h2>
      <p className="mt-1 text-sm text-text-muted">Changes apply straight away and are saved in this browser.</p>

      <div className="mt-4 max-w-2xl space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">Theme</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {THEMES.map((t) => (
              <label key={t.value} className={OPTION}>
                <input
                  type="radio"
                  name={`${uid}-theme`}
                  value={t.value}
                  checked={prefs.theme === t.value}
                  onChange={() => update({ theme: t.value }, `Theme: ${t.label}.`)}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-xs text-text-muted">{t.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">Text size</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TEXT_SIZES.map((s) => (
              <label key={s.value} className={OPTION}>
                <input
                  type="radio"
                  name={`${uid}-size`}
                  value={s.value}
                  checked={prefs.textSize === s.value}
                  onChange={() => update({ textSize: s.value }, `Text size: ${s.label}.`)}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-xs text-text-muted">{Math.round(s.scale * 100)}%</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-text">Reading and motion</legend>
          {TOGGLES.map((t) => (
            <label key={t.key} className={OPTION}>
              <input
                type="checkbox"
                checked={prefs[t.key]}
                onChange={(e) => update({ [t.key]: e.target.checked }, `${t.label} ${e.target.checked ? "on" : "off"}.`)}
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
              <span>
                <span className="block font-medium">{t.label}</span>
                <span className="block text-xs text-text-muted">{t.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => update(DEFAULT_PREFERENCES, "Appearance reset to the defaults.")}
          >
            Reset to defaults
          </button>
          {/* Screen readers hear each change; sighted students see it happen. */}
          <span role="status" aria-live="polite" className="sr-only">
            {status}
          </span>
        </div>
      </div>
    </section>
  );
}
