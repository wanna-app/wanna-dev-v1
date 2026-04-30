import type { ActivityCategory } from "../constants/categories";
import type { Intent } from "../constants/enums";

export interface MyActivityRow {
  activity_id: string;
  title: string;
  category: ActivityCategory;
  intent: Intent;
  activity_date: string | null;
  location_name: string | null;
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
}
