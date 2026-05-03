export const colors = {
  primary: {
    lavenderMist: "#D4BBFF",
    softViolet: "#B388FF",
    wannaPurple: "#8C52FF",
    deepViolet: "#6B3ACC",
    royalPurple: "#4A2299",
  },
  secondary: {
    iceCyan: "#C8F4F8",
    wannaCyan: "#86E2EB",
    wannaTeal: "#57B8D0",
    oceanTeal: "#3D9AB0",
    deepTeal: "#276880",
  },
  neutral: {
    white: "#FFFFFF",
    cloud: "#F5F5F7",
    slate: "#B0B0B8",
    charcoal: "#2D2D3A",
    black: "#000000",
  },
  gradient: {
    start: "#8C52FF",
    end: "#86E2EB",
  },

  // Semantic surface tokens (from mockup brand guide v1)
  fg: {
    primary: "#2D2D3A",
    secondary: "#5A5A6B",
    tertiary: "#B0B0B8",
    onBrand: "#FFFFFF",
    brand: "#8C52FF",
    link: "#6B3ACC",
  },
  bg: {
    app: "#FFFFFF",
    subtle: "#F5F5F7",
    inverse: "#2D2D3A",
    brand: "#8C52FF",
    brandSoft: "#D4BBFF",
  },
  border: {
    subtle: "#ECECEF",
    default: "#DDDDE3",
    strong: "#B0B0B8",
    brand: "#8C52FF",
  },
  state: {
    success: "#34C77A",
    warning: "#F5B544",
    danger: "#FF5C7A",
    info: "#57B8D0",
  },
} as const;

// Per-category mapping used for gradient backgrounds when no photo is set
// (matches the mockup's ACTIVITY constant). Two-stop linear gradients run
// at 160deg from top-left to bottom-right.
export const categoryGradients: Record<string, [string, string, string]> = {
  "Music & Concerts":     ["#4A2299", "#8C52FF", "#FF5C7A"],
  "Outdoors & Adventure": ["#276880", "#57B8D0", "#C8F4F8"],
  "Fitness & Sports":     ["#3D9AB0", "#86E2EB", "#D4BBFF"],
  "Food & Dining":        ["#FF5C7A", "#B388FF", "#8C52FF"],
  "Arts & Culture":       ["#6B3ACC", "#B388FF", "#C8F4F8"],
  "Bars & Nightlife":     ["#2D2D3A", "#4A2299", "#FF5C7A"],
  "Books & Learning":     ["#57B8D0", "#B388FF", "#8C52FF"],
  "Movies & Shows":       ["#4A2299", "#8C52FF", "#86E2EB"],
  "Gaming & Tech":        ["#276880", "#4A2299", "#B388FF"],
  "Other":                ["#8C52FF", "#86E2EB", "#86E2EB"],
};

// Per-category Phosphor icon names (kebab-case, used as icon prop name)
export const categoryIcons: Record<string, string> = {
  "Music & Concerts":     "MusicNotes",
  "Outdoors & Adventure": "Mountains",
  "Fitness & Sports":     "TennisBall",
  "Food & Dining":        "ForkKnife",
  "Arts & Culture":       "Palette",
  "Bars & Nightlife":     "Martini",
  "Books & Learning":     "BookOpen",
  "Movies & Shows":       "FilmStrip",
  "Gaming & Tech":        "GameController",
  "Other":                "Sparkle",
};

/**
 * Rainbow palette for interest pills — distinct, recognizable colors per
 * category. Used on Profile / UserProfile / Who's In so the chip cluster
 * reads as a colorful index rather than a wash of brand-purple.
 *
 * Spaced around the wheel: pink → orange → yellow → green → teal →
 * blue → indigo → violet → magenta → coral.
 */
export const interestColors: Record<string, string> = {
  "Arts & Culture":       "#FF5C7A", // pink
  "Food & Dining":        "#FFB347", // amber
  "Fitness & Sports":     "#FFD93D", // yellow
  "Outdoors & Adventure": "#34C77A", // green
  "Books & Learning":     "#57B8D0", // teal
  "Gaming & Tech":        "#1E90FF", // blue
  "Movies & Shows":       "#6B3ACC", // deep violet
  "Music & Concerts":     "#8C52FF", // brand purple
  "Bars & Nightlife":     "#FF8A65", // coral
  "Other":                "#B388FF", // lavender
};
