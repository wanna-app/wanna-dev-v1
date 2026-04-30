export interface ConversationListItem {
  other_user_id: string;
  other_user_name: string;
  other_user_photo: string | null;
  other_user_verified: boolean;
  shared_activity_ids: string[];
  shared_activity_titles: string[];
  has_active_match: boolean;
  last_message_id: string | null;
  last_message_body: string | null;
  last_message_at: string | null;
  last_message_from_me: boolean;
  unread_count: number;
}

export interface ChatMessage {
  message_id: string;
  match_id: string;
  activity_id: string;
  activity_title: string;
  sender_id: string;
  body: string;
  status: "sent" | "delivered" | "read";
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

export interface ActiveMatchContext {
  match_id: string;
  activity_id: string;
  activity_title: string;
  matched_at: string;
}
