export const ACTIVITY_CATEGORIES = [
  "Arts & Culture",
  "Bars & Nightlife",
  "Books & Learning",
  "Fitness & Sports",
  "Food & Dining",
  "Gaming & Tech",
  "Movies & Shows",
  "Music & Concerts",
  "Outdoors & Adventure",
  "Other",
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const CATEGORY_EMOJI: Record<ActivityCategory, string> = {
  "Arts & Culture": "🎨",
  "Bars & Nightlife": "🍸",
  "Books & Learning": "📚",
  "Fitness & Sports": "🏃",
  "Food & Dining": "🍽️",
  "Gaming & Tech": "🎮",
  "Movies & Shows": "🎬",
  "Music & Concerts": "🎶",
  "Outdoors & Adventure": "🏞️",
  Other: "✨",
};

/** Convenience: "🎨 Arts & Culture" */
export const categoryWithEmoji = (c: ActivityCategory): string =>
  `${CATEGORY_EMOJI[c]} ${c}`;
