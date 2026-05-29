import type {
  Gender,
  Intent,
  ShowMe,
  SwipeDirection,
  InterestStatus,
  MatchStatus,
  MessageStatus,
  ActivityStatus,
  ReportReason,
  ReportStatus,
  Resolution,
  PoliticalOrientation,
  FrequencyOption,
  StarSign,
  MeetupTriggerType,
  ReportedContentType,
} from "../constants/enums";
import type { ActivityCategory } from "../constants/categories";

export interface Profile {
  id: string;
  first_name: string;
  date_of_birth: string;
  bio: string | null;
  photos: string[];
  activity_preferences: string[];
  gender: Gender;
  profession: string | null;
  university: string | null;
  neighborhood: string | null;
  political_orientation: PoliticalOrientation | null;
  alcohol: FrequencyOption | null;
  marijuana: FrequencyOption | null;
  star_sign: StarSign | null;
  has_seen_public_safety: boolean;
  is_verified: boolean;
  verification_photo_url: string | null;
  is_seed: boolean;
  is_moderator: boolean;
  location_lat: number | null;
  location_lng: number | null;
  is_active: boolean;
  is_paused: boolean;
  deactivated_at: string | null;
  banned_until: string | null;
  ban_reason: string | null;
  email_notifications_enabled: boolean;
  // Per-type x per-channel notification preferences (migration 00034).
  // The legacy `email_notifications_enabled` flag above stays for backward
  // compatibility with edge functions still on the old gate; new client code
  // reads these granular columns instead.
  notify_interest_push: boolean;
  notify_interest_email: boolean;
  notify_match_push: boolean;
  notify_match_email: boolean;
  notify_message_push: boolean;
  notify_message_email: boolean;
  notify_meetup_push: boolean;
  notify_meetup_email: boolean;
  notify_new_activities_push: boolean;
  notify_new_activities_email: boolean;
  // Marketing-class email opt-in (welcome, weekly digest, product
  // updates). Separate from the notify_*_email transactional flags and
  // the legacy email_notifications_enabled gate. Account/security
  // emails (auth, ban notice) are NEVER gated by this flag. Migration
  // 00041.
  marketing_emails_enabled: boolean;
  read_receipts_enabled: boolean;
  // IANA timezone (e.g. 'America/Los_Angeles'). Written on first login and
  // refreshed whenever the device timezone changes (00037).
  timezone: string | null;
  // One-time flag: true once the client has fired the Mixpanel
  // account_created event for this user. New rows default false;
  // existing rows backfilled to true (migration 00058).
  signup_event_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryPreferences {
  user_id: string;
  modes: Intent[];
  show_me: ShowMe;
  age_min: number;
  age_max: number;
  max_distance_miles: number;
}

export type PhotoSource = "link" | "upload" | "unsplash";

// Compliance JSON for Unsplash-sourced photos. Required by Unsplash's API
// guidelines so we can render attribution and fire the download-trigger
// beacon. See: https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines
export interface UnsplashAttribution {
  photographer_name: string;
  photographer_username: string;
  photographer_url: string;
  photo_id: string;
  photo_url: string;
  download_location: string;
}

export interface Activity {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: ActivityCategory;
  /** Legacy single-mode field. Kept until every read path has switched
   *  to `intents`. New code should prefer `intents`. */
  intent: Intent;
  /** Modes the poster is open to (one or more). */
  intents: Intent[];
  location_lat: number | null;
  location_lng: number | null;
  location_name: string | null;
  activity_date: string | null;
  link: string | null;
  // Required hero photo (migration 00021)
  photo_url: string;
  photo_source: PhotoSource;
  photo_attribution: UnsplashAttribution | null;
  is_seed: boolean;
  status: ActivityStatus;
  created_at: string;
  updated_at: string;
}

export interface Swipe {
  id: string;
  swiper_id: string;
  activity_id: string;
  activity_owner_id: string;
  direction: SwipeDirection;
  created_at: string;
}

export interface InterestQueueEntry {
  id: string;
  activity_id: string;
  interested_user_id: string;
  status: InterestStatus;
  batch_number: number;
  created_at: string;
  reviewed_at: string | null;
}

export interface Match {
  id: string;
  activity_id: string;
  poster_id: string;
  interested_id: string;
  status: MatchStatus;
  matched_at: string;
  unmatched_at: string | null;
  unmatched_by: string | null;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  status: MessageStatus;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

export interface MeetupCheck {
  id: string;
  match_id: string;
  user_id: string;
  did_meet: boolean | null;
  trigger_type: MeetupTriggerType;
  triggered_at: string;
  responded_at: string | null;
  dismiss_count: number;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reported_content_type: ReportedContentType | null;
  reported_content_id: string | null;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  resolution: Resolution | null;
  moderator_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Block {
  id: string;
  blocker_id: string;
  blocked_user_id: string;
  created_at: string;
}
