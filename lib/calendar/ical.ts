// A small reader for iCalendar (.ics) feeds, such as the subscription link UTS
// My Timetable gives: each VEVENT's text fields and times, nothing else.
//
// Times are kept as written (wall time plus TZID, UTC, or a whole day), since
// turning wall time into an instant needs a timezone; lib/data/timetable does
// that. RRULE isn't expanded: UTS lists every session as its own event.

export interface IcsTime {
  /** "YYYY-MM-DD" */
  date: string;
  hour: number;
  minute: number;
  /** Written with a trailing Z. */
  utc: boolean;
  tzid?: string;
  /** VALUE=DATE: a day, not a time. */
  allDay: boolean;
}

export interface IcsEvent {
  uid?: string;
  summary: string;
  description?: string;
  location?: string;
  start: IcsTime;
  end?: IcsTime;
}

interface Property {
  params: Record<string, string>;
  value: string;
}

const TIME = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/;

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let props: Map<string, Property> | null = null;
  // Components inside a VEVENT (a VALARM's DESCRIPTION, say) aren't the event's.
  let nested = 0;

  for (const line of unfold(text)) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      props = new Map();
      nested = 0;
      continue;
    }
    if (!props) continue;
    if (upper === "END:VEVENT") {
      const event = toEvent(props);
      if (event) events.push(event);
      props = null;
      continue;
    }
    if (upper.startsWith("BEGIN:")) nested++;
    else if (upper.startsWith("END:")) nested--;
    else if (nested === 0) {
      const prop = parseLine(line);
      if (prop && !props.has(prop.name)) props.set(prop.name, prop);
    }
  }
  return events;
}

function toEvent(props: Map<string, Property>): IcsEvent | null {
  const start = props.get("DTSTART");
  const time = start && parseTime(start);
  if (!time) return null;
  const end = props.get("DTEND");
  return {
    uid: props.get("UID")?.value,
    summary: unescape(props.get("SUMMARY")?.value ?? ""),
    description: text(props.get("DESCRIPTION")),
    location: text(props.get("LOCATION")),
    start: time,
    end: (end && parseTime(end)) || undefined,
  };
}

function text(prop: Property | undefined): string | undefined {
  return prop ? unescape(prop.value) : undefined;
}

function parseTime({ params, value }: Property): IcsTime | null {
  const m = TIME.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  return {
    date: `${y}-${mo}-${d}`,
    hour: Number(h ?? 0),
    minute: Number(mi ?? 0),
    utc: z === "Z",
    tzid: params.TZID,
    allDay: h === undefined || params.VALUE === "DATE",
  };
}

/** NAME;PARAM=value;PARAM="quoted:value":VALUE */
function parseLine(line: string): (Property & { name: string }) | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;

  const [name, ...rest] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const param of rest) {
    const eq = param.indexOf("=");
    if (eq > 0) params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/** Long lines continue on the next line after a space or tab. */
function unfold(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function unescape(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c)).trim();
}
