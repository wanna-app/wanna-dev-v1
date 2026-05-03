import React from "react";
// Phosphor Icons RN — tree-shakable named imports. Keep this list in sync
// with what we actually use across screens. Adding new icons is cheap
// (per-icon import = per-icon bundle inclusion).
import {
  // Nav / chrome
  CaretLeft,
  CaretRight,
  CaretDown,
  X,
  DotsThree,
  ShareFat,
  FadersHorizontal,
  // Activity categories
  MusicNotes,
  Mountains,
  TennisBall,
  ForkKnife,
  Palette,
  Martini,
  BookOpen,
  FilmStrip,
  GameController,
  Sparkle,
  // Meta / actions
  MapPin,
  CalendarBlank,
  CalendarPlus,
  HandWaving,
  Heart,
  BookmarkSimple,
  ChatCircle,
  SealCheck,
  UsersThree,
  Quotes,
  MicrophoneStage,
  ArrowCounterClockwise,
} from "phosphor-react-native";

// PascalCase mapping that mirrors the mockup's `ph-bold ph-mountains` syntax.
// Add new icons here as they're needed in screens — this is the only file
// that imports from phosphor-react-native.
export const ICONS = {
  CaretLeft,
  CaretRight,
  CaretDown,
  X,
  DotsThree,
  ShareFat,
  FadersHorizontal,
  MusicNotes,
  Mountains,
  TennisBall,
  ForkKnife,
  Palette,
  Martini,
  BookOpen,
  FilmStrip,
  GameController,
  Sparkle,
  MapPin,
  CalendarBlank,
  CalendarPlus,
  HandWaving,
  Heart,
  BookmarkSimple,
  ChatCircle,
  SealCheck,
  UsersThree,
  Quotes,
  MicrophoneStage,
  ArrowCounterClockwise,
} as const;

export type IconName = keyof typeof ICONS;
export type IconWeight = "regular" | "bold" | "fill" | "light" | "thin" | "duotone";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Phosphor weight. Defaults to 'bold' to match the mockup style. */
  weight?: IconWeight;
}

/**
 * Wrapper around phosphor-react-native that gives us:
 *   - Centralized icon registry (one import file to maintain)
 *   - Sensible default weight ('bold' — matches mockup chrome)
 *   - Type-safe icon names
 *
 * Usage:
 *   <Icon name="HandWaving" size={28} color="#fff" weight="fill" />
 */
export function Icon({ name, size = 20, color = "#2D2D3A", weight = "bold" }: IconProps) {
  const Component = ICONS[name];
  return <Component size={size} color={color} weight={weight} />;
}
