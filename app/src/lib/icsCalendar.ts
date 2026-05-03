import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/**
 * Client-side .ics generator + share-sheet handoff. We deliberately avoid
 * a native EKEventStore write here — that requires `expo-calendar` and an
 * `NSCalendarsUsageDescription` permission which is deferred (see
 * DEFERRED.md → "Native iOS Calendar write"). For now, generating a
 * standard VCALENDAR/VEVENT file and surfacing the iOS share sheet lets
 * the user pick whichever calendar app they actually use (Apple Calendar,
 * Outlook, Google Calendar via the Gmail app, Fantastical, etc.).
 */
export interface CalendarActivity {
  id: string;
  title: string;
  description?: string | null;
  location_name?: string | null;
  /** YYYY-MM-DD, treated as a local-date all-day event. */
  activity_date?: string | null;
}

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

function buildIcs(activity: CalendarActivity): string {
  const startDate =
    (activity.activity_date && parseLocalYmd(activity.activity_date)) ||
    // Default to "tomorrow" if the activity has no date set — avoids
    // generating a calendar entry stamped today which would be useless.
    (() => {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0, 0, 0);
      return t;
    })();
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

export async function addActivityToCalendar(
  activity: CalendarActivity
): Promise<void> {
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
