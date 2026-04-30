export const INTENTS = ["friends", "dating", "networking"] as const;
export type Intent = (typeof INTENTS)[number];

export const GENDERS = ["man", "woman", "nonbinary"] as const;
export type Gender = (typeof GENDERS)[number];

export const SHOW_ME_OPTIONS = ["men", "women", "everyone"] as const;
export type ShowMe = (typeof SHOW_ME_OPTIONS)[number];

export const SWIPE_DIRECTIONS = ["like", "pass"] as const;
export type SwipeDirection = (typeof SWIPE_DIRECTIONS)[number];

export const INTEREST_STATUSES = ["pending", "accepted", "rejected"] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

export const MATCH_STATUSES = ["active", "unmatched"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MESSAGE_STATUSES = ["sent", "delivered", "read"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const ACTIVITY_STATUSES = ["active", "past_date", "deleted"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const REPORT_REASONS = [
  "Inappropriate content",
  "Harassment or bullying",
  "Spam or scam",
  "Fake profile / catfishing",
  "Underage user",
  "Threatening behavior",
  "Activity not in a public place",
  "Other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = [
  "pending",
  "reviewing",
  "resolved",
  "dismissed",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const RESOLUTIONS = [
  "no_action",
  "warning",
  "content_removed",
  "temp_ban",
  "permanent_ban",
] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const POLITICAL_ORIENTATIONS = [
  "liberal",
  "moderate",
  "conservative",
] as const;
export type PoliticalOrientation = (typeof POLITICAL_ORIENTATIONS)[number];

export const FREQUENCY_OPTIONS = [
  "never",
  "rarely",
  "sometimes",
  "often",
] as const;
export type FrequencyOption = (typeof FREQUENCY_OPTIONS)[number];

export const STAR_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;
export type StarSign = (typeof STAR_SIGNS)[number];

export const MEETUP_TRIGGER_TYPES = [
  "date_passed",
  "timer_72h",
  "chat_opened",
] as const;
export type MeetupTriggerType = (typeof MEETUP_TRIGGER_TYPES)[number];

export const REPORTED_CONTENT_TYPES = [
  "activity",
  "message",
  "photo",
  "profile",
] as const;
export type ReportedContentType = (typeof REPORTED_CONTENT_TYPES)[number];
