// How weeks are stored. A week is a course_modules row. Canvas modules aren't
// always weeks (see scraper/week_rows.py), so a week Canvas has no module named
// "Week N" for gets a SYNTHETIC module: made up by the app, absent from Canvas,
// with external_module_id "canoka:week:N" and name "Week N".
//
// So a week has one module: the real Canvas module named for it, else the
// synthetic one. Notes attach to it, and so does content the scrape finds for
// the week outside any numbered module. Should two exist anyway (a synthetic
// one made before Canvas's module was synced, or two real modules for one
// week), everything that reads goes by the module's `week_number`, never by a
// single module id, and groupWeeks picks which one new rows use.

export const WEEK_MODULE_PREFIX = "canoka:week:";

const SYNTHETIC = /^canoka:week:(\d{1,2})$/;

export const weekModuleKey = (week: number) => `${WEEK_MODULE_PREFIX}${week}`;

/** The week a synthetic week module stands for, or null if it's a real Canvas module. */
export function syntheticWeek(externalModuleId: string): number | null {
  const week = Number(SYNTHETIC.exec(externalModuleId)?.[1]);
  return week >= 1 ? week : null;
}

/** "Week 3:  Systems Thinking in Practice" -> "Systems Thinking in Practice"; "Week 1" -> null. */
export function weekTitle(moduleName: string): string | null {
  return moduleName.replace(/^.*?\bweek\s*\d{1,2}\b[\s:|\-–—]*/i, "").trim() || null;
}

/** The columns of a course_modules row that choosing a week's module needs. */
export interface WeekModule {
  id: string;
  external_module_id: string;
  name: string;
  position: number | null;
  /** Generated from "Week N" in `name` (migration course_modules_week_number); null if it names none. */
  week_number: number | null;
  created_at: string;
}

export interface WeekGroup {
  number: number;
  /** The module new notes and week content go under. */
  canonical: WeekModule;
  /** Every module for the week, canonical first. */
  modules: WeekModule[];
  /** What the Canvas module named for the week says after "Week N", if it says anything. */
  title: string | null;
}

/** The week a module is for, or null if it isn't one. A synthetic module's name always says, so its id is a fallback. */
export function weekOfModule(module: Pick<WeekModule, "external_module_id" | "week_number">): number | null {
  return module.week_number ?? syntheticWeek(module.external_module_id);
}

/**
 * The weeks in these modules (one subject's, or one week's), each once, by
 * week number. A week's canonical module is the real Canvas module with the
 * lowest position (then the oldest, then by id), or the synthetic one if no
 * real module is named for it. This rule is repeated in the SQL of migration
 * merge_duplicate_week_modules: change one, change the other.
 */
export function groupWeeks(modules: WeekModule[]): Map<number, WeekGroup> {
  const byWeek = new Map<number, WeekModule[]>();
  for (const module of modules) {
    const week = weekOfModule(module);
    if (week) byWeek.set(week, [...(byWeek.get(week) ?? []), module]);
  }

  const weeks = new Map<number, WeekGroup>();
  Array.from(byWeek.keys())
    .sort((a, b) => a - b)
    .forEach((number) => {
      const ordered = (byWeek.get(number) ?? []).sort(canonicalFirst);
      const title = ordered.map((m) => (syntheticWeek(m.external_module_id) ? null : weekTitle(m.name))).find(Boolean);
      weeks.set(number, { number, canonical: ordered[0], modules: ordered, title: title ?? null });
    });
  return weeks;
}

function canonicalFirst(a: WeekModule, b: WeekModule): number {
  const synthetic = Number(syntheticWeek(a.external_module_id) !== null) - Number(syntheticWeek(b.external_module_id) !== null);
  if (synthetic !== 0) return synthetic;
  // Position ascending, with no position last: like `order by position nulls last`.
  if ((a.position === null) !== (b.position === null)) return a.position === null ? 1 : -1;
  if (a.position !== null && b.position !== null && a.position !== b.position) return a.position - b.position;
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}
