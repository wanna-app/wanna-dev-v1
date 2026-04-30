export interface ModReportRow {
  report_id: string;
  reason: string;
  description: string | null;
  created_at: string;
  reporter_id: string;
  reporter_name: string;
  reported_user_id: string;
  reported_user_name: string;
  reported_user_photo: string | null;
  reported_user_is_verified: boolean;
  reported_content_type: string | null;
  reported_content_id: string | null;
  total_reports_against_user: number;
}

export interface ModPhotoFlagRow {
  moderation_id: string;
  user_id: string;
  user_first_name: string;
  photo_path: string;
  bucket: string;
  flagged_categories: string[];
  flagged_labels: string[] | null;
  adult_likelihood: string | null;
  violence_likelihood: string | null;
  racy_likelihood: string | null;
  spoof_likelihood: string | null;
  created_at: string;
}

export interface ModVerificationRow {
  user_id: string;
  first_name: string;
  photos: string[];
  verification_photo_url: string;
  created_at: string;
}

export type ReportResolution =
  | "no_action"
  | "warning"
  | "content_removed"
  | "temp_ban"
  | "permanent_ban";

export type PhotoDecision = "allowed_by_mod" | "rejected";
