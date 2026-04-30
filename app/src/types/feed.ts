import type { ActivityCategory } from "../constants/categories";
import type { Intent } from "../constants/enums";

export interface FeedCard {
  activity_id: string;
  title: string;
  description: string | null;
  category: ActivityCategory;
  intent: Intent;
  location_lat: number | null;
  location_lng: number | null;
  location_name: string | null;
  activity_date: string | null;
  created_at: string;
  poster_id: string;
  poster_name: string;
  poster_photo: string | null;
  poster_verified: boolean;
  poster_age: number;
  distance_miles: number | null;
  interest_score: number;
}
