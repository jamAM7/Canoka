// Appearance and accessibility preferences: theme, contrast, text size,
// motion, spacing and link underlines. They belong to this browser, like a
// zoom level, so they're kept in localStorage rather than Supabase.
//
// They take effect as attributes on <html> that styles/variables.css reads.
// PREFERENCES_SCRIPT sets them in <head> before the page first paints (so a
// dark-mode student never sees a white flash), follows the operating
// system's light/dark setting when the theme is "system", and keeps other
// tabs in step. Settings › Appearance calls it again after each change.

export type Theme = "system" | "light" | "dark";
export type TextSize = "default" | "large" | "larger" | "largest";

export interface Preferences {
  theme: Theme;
  highContrast: boolean;
  textSize: TextSize;
  reduceMotion: boolean;
  wideSpacing: boolean;
  underlineLinks: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  highContrast: false,
  textSize: "default",
  reduceMotion: false,
  wideSpacing: false,
  underlineLinks: false,
};

const KEY = "canoka.preferences.v1";

declare global {
  interface Window {
    /** Defined by PREFERENCES_SCRIPT. Applies `prefs`, or what's saved when omitted. */
    __canokaApplyPreferences?: (prefs?: Partial<Preferences>) => void;
  }
}

/** Plain JavaScript, inlined in app/layout's <head>: it runs before React or any bundle loads. */
export const PREFERENCES_SCRIPT = `(function () {
  var key = ${JSON.stringify(KEY)};
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function saved() {
    try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (e) { return {}; }
  }
  var current = {};
  function apply(prefs) {
    var p = prefs || saved();
    current = p;
    root.dataset.theme = p.theme === "light" || p.theme === "dark" ? p.theme : media.matches ? "dark" : "light";
    root.dataset.contrast = p.highContrast ? "high" : "normal";
    root.dataset.textSize = /^(large|larger|largest)$/.test(p.textSize) ? p.textSize : "default";
    root.dataset.motion = p.reduceMotion ? "reduce" : "no-preference";
    root.dataset.spacing = p.wideSpacing ? "wide" : "normal";
    root.dataset.underlineLinks = p.underlineLinks ? "on" : "off";
  }
  apply();
  media.addEventListener("change", function () { apply(current); });
  window.addEventListener("storage", function (e) { if (e.key === key) apply(); });
  window.__canokaApplyPreferences = apply;
})();`;

export function loadPreferences(): Preferences {
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(window.localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Saves and applies at once. Applying doesn't wait on storage, so a blocked localStorage still works for this visit. */
export function savePreferences(prefs: Preferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked or full: the change still applies until the page reloads.
  }
  window.__canokaApplyPreferences?.(prefs);
}
