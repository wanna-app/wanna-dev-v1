import type { ActivityCategory } from "../constants/categories";
import type { Intent } from "../constants/enums";

export interface MyActivityRow {
  activity_id: string;
  title: string;
  category: ActivityCategory;
  intent: Intent;          // legacy
  intents: Intent[];
  activity_date: string | null;
  location_name: string | null;
  photo_url: string;
  pending_count: number;
  has_active_match: boolean;
  match_id: string | null;
  matched_user_id: string | null;
  matched_user_name: string | null;
  matched_user_photo: string | null;
}

export interface InterestedUser {
  queue_id: string;
  user_id: string;
  first_name: string;
  photos: string[];
  bio: string | null;
  age: number;
  is_verified: boolean;
  activity_preferences: string[];
  distance_miles: number | null;
  created_at: string;
  /** Mode the swiper was in when they liked the activity. NULL for legacy
   *  rows that pre-date migration 00024. */
  swiper_mode: Intent | null;
  /** Optional one-line note the swiper attached when expressing interest.
   *  Max 300 chars. Shown to the poster on the Who's In list. */
  first_message: string | null;
}
