import { ActionSheetIOS, Alert, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/**
 * "Add to calendar" orchestrator.
 *
 * On iOS we present an action sheet:
 *   - "Save to Calendar"               → native EKEventStore write via expo-calendar
 *   - "Share to other calendar app"    → .ics share-sheet handoff (works for
 *                                        Google Calendar, Outlook, Fantastical, etc.)
 *   - "Cancel"
 *
 * On Android (or if the iOS user denies calendar permission, or if
 * `expo-calendar` isn't linked into the binary) we fall back to the .ics
 * share path so the feature still works.
 */
export interface CalendarActivity {
  id: string;
  title: string;
  description?: string | null;
  location_name?: string | null;
  /** YYYY-MM-DD, treated as a local-date all-day event. */
  activity_date?: string | null;
}

// ---------------------------------------------------------------------------
// .ics generation (RFC-5545)
// ---------------------------------------------------------------------------

// RFC-5545 §3.3.11 — TEXT values must escape backslash, comma, semicolon,
// and newline. Order matters: backslash first so we don't double-escape
// the escape sequences we just inserted.
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function nowDtstampUtc(): string {
  const d = new Date();
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

// All-day events use VALUE=DATE with a YYYYMMDD string (no time, no Z).
// We encode the local-calendar date the user picked. DTEND for all-day
// events is exclusive — i.e. DTSTART + 1 day — per RFC-5545.
function dateToIcsDate(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function parseLocalYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Resolve the activity's start date, falling back to "tomorrow". */
function resolveStartDate(activity: CalendarActivity): Date {
  return (
    (activity.activity_date && parseLocalYmd(activity.activity_date)) ||
    (() => {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0, 0, 0);
      return t;
    })()
  );
}

function buildIcs(activity: CalendarActivity): string {
  const startDate = resolveStartDate(activity);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wanna//Wanna App//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${activity.id}@wanna.app`,
    `DTSTAMP:${nowDtstampUtc()}`,
    `DTSTART;VALUE=DATE:${dateToIcsDate(startDate)}`,
    `DTEND;VALUE=DATE:${dateToIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(activity.title)}`,
  ];
  if (activity.location_name) {
    lines.push(`LOCATION:${escapeIcsText(activity.location_name)}`);
  }
  if (activity.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(activity.description)}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  // RFC-5545 mandates CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// .ics share-sheet handoff (works on every platform; fallback path)
// ---------------------------------------------------------------------------

async function shareIcs(activity: CalendarActivity): Promise<void> {
  try {
    const ics = buildIcs(activity);
    const path = `${FileSystem.cacheDirectory}wanna-${activity.id}.ics`;
    await FileSystem.writeAsStringAsync(path, ics, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(
        "Couldn't add to calendar",
        "Sharing isn't available on this device."
      );
      return;
    }
    await Sharing.shareAsync(path, {
      mimeType: "text/calendar",
      // UTI helps iOS route the file to calendar apps specifically.
      UTI: "public.calendar-event",
      dialogTitle: "Add to calendar",
    });
  } catch (e: any) {
    Alert.alert(
      "Couldn't add to calendar",
      e?.message ?? "Something went wrong generating the calendar file."
    );
  }
}

// ---------------------------------------------------------------------------
// Native EKEventStore / Android Calendar Provider write via expo-calendar
// ---------------------------------------------------------------------------

/**
 * Write directly to the OS calendar. Falls back to `shareIcs` if:
 *   - `expo-calendar` isn't linked into this binary (e.g. Expo Go w/o dev client)
 *   - The user denies the calendar permission prompt
 *   - No writable default calendar is found
 *   - The native API throws
 */
async function saveToNativeCalendar(activity: CalendarActivity): Promise<void> {
  let Calendar: typeof import("expo-calendar");
  try {
    // Lazy-require so the rest of the app builds and runs without the
    // native module being linked. In Expo Go (no custom dev client) this
    // require() can throw at runtime; we catch and fall back to .ics.
    Calendar = require("expo-calendar");
  } catch (e) {
    await shareIcs(activity);
    return;
  }

  try {
    const perm = await Calendar.requestCalendarPermissionsAsync();
    if (perm.status !== "granted") {
      await shareIcs(activity);
      return;
    }

    let calendarId: string | null = null;
    if (Platform.OS === "ios") {
      const def = await Calendar.getDefaultCalendarAsync();
      calendarId = def?.id ?? null;
    } else {
      const cals = await Calendar.getCalendarsAsync(
        Calendar.EntityTypes.EVENT
      );
      const writable = cals.find((c: any) => c.allowsModifications);
      calendarId = writable?.id ?? null;
    }

    if (!calendarId) {
      await shareIcs(activity);
      Alert.alert(
        "Calendar fallback",
        "Couldn't find a writable calendar — opened the share sheet instead."
      );
      return;
    }

    // All-day if `activity_date` is set; otherwise tomorrow 9am for 2h.
    const isAllDay = Boolean(activity.activity_date);
    let startDate: Date;
    let endDate: Date;
    if (isAllDay) {
      startDate = resolveStartDate(activity);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      startDate.setHours(9, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(11, 0, 0, 0);
    }

    await Calendar.createEventAsync(calendarId, {
      title: activity.title,
      startDate,
      endDate,
      allDay: isAllDay,
      location: activity.location_name ?? undefined,
      notes: activity.description ?? undefined,
      alarms: [{ relativeOffset: -60 }],
    } as any);

    Alert.alert(
      "Added to Calendar",
      "We added it to your default calendar."
    );
  } catch (e: any) {
    // Soft-fall-back to the .ics share path so the user can still save it.
    await shareIcs(activity);
    Alert.alert(
      "Calendar fallback",
      "Couldn't write directly to your calendar — opened the share sheet instead."
    );
  }
}

// ---------------------------------------------------------------------------
// Public entry point — orchestrates the action sheet on iOS, falls back to
// .ics share on Android.
// ---------------------------------------------------------------------------

export async function addActivityToCalendar(
  activity: CalendarActivity
): Promise<void> {
  if (Platform.OS !== "ios") {
    // Android Calendar Provider flow is less standardized — keep the
    // share-sheet handoff as the default. (Native write is still wired
    // through `saveToNativeCalendar` if we ever want to expose it.)
    await shareIcs(activity);
    return;
  }

  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: ["Save to Calendar", "Share to other calendar app", "Cancel"],
      cancelButtonIndex: 2,
      title: "Add to calendar",
    },
    (buttonIndex) => {
      if (buttonIndex === 0) {
        void saveToNativeCalendar(activity);
      } else if (buttonIndex === 1) {
        void shareIcs(activity);
      }
    }
  );
}
