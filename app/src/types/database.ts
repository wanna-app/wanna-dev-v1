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
  political_orientation: PoliticalOrientation | null;
  alcohol: FrequencyOption | null;
  marijuana: FrequencyOption | null;
  star_sign: StarSign | null;
  has_seen_public_safety: boolean;
  is_verified: boolean;
  verification_photo_url: string | null;
  is_seed: boolean;
  location_lat: number | null;
  location_lng: number | null;
  is_active: boolean;
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

export interface Activity {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: ActivityCategory;
  intent: Intent;
  location_lat: number | null;
  location_lng: number | null;
  location_name: string | null;
  activity_date: string | null;
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
