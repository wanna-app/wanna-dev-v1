import React, { useEffect } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { colors, fonts, fontSizes, shadows } from "../theme";

interface MatchModalProps {
  visible: boolean;
  matchedName: string;
  matchedPhoto: string | null;
  /** Activity hero — used as the celebration photo. Optional; falls back
   *  to a brand gradient. */
  activityPhotoUrl?: string | null;
  activityTitle: string;
  /** Optional human date label like "Sat · Nov 8" */
  activityDateLabel?: string;
  /** Optional location like "Griffith Courts · 2.4 mi" */
  activityLocationLabel?: string;
  /** Pre-resolved profile photo for the current user (for the "you" avatar). */
  yourPhoto?: string | null;
  yourName?: string;
  onSayHi: () => void;
  onKeepBrowsing: () => void;
  /** Optional add-to-calendar handler. Hidden if not provided. */
  onAddToCalendar?: () => void;
}

// ─── Animated foreground confetti ───────────────────────────────────
// Replaces the previous static SVG. Each piece falls top→bottom with a
// continuous rotation; staggered start delays give an organic burst.
// Rendered ABOVE all modal content (after children) with pointerEvents
// disabled so it never blocks the CTAs.
const SCREEN_H = Dimensions.get("window").height;
const SCREEN_W = Dimensions.get("window").width;
const CONFETTI_COLORS = [
  "#FFE7B0",
  "#FF5C7A",
  "#86E2EB",
  "#FFD93D",
  "#B388FF",
  "#FFFFFF",
];

interface Piece {
  startX: number;
  size: number;
  shape: "rect" | "circle";
  color: string;
  delay: number;
  duration: number;
  rotateDir: 1 | -1;
  drift: number;
}

// Deterministic-but-scattered set so the array doesn't change between
// renders (would otherwise re-mount Animated.Views and re-trigger
// animations). 36 pieces is enough density without being janky.
const PIECES: Piece[] = Array.from({ length: 36 }).map((_, i) => {
  const seed = i * 9301 + 49297;
  const r = (seed % 233280) / 233280; // [0, 1)
  const r2 = ((seed * 2) % 233280) / 233280;
  const r3 = ((seed * 3) % 233280) / 233280;
  return {
    startX: r * SCREEN_W,
    size: 6 + r2 * 8,
    shape: r3 > 0.55 ? "circle" : "rect",
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: r * 1800,
    duration: 2800 + r2 * 1800,
    rotateDir: r3 > 0.5 ? 1 : -1,
    drift: (r2 - 0.5) * 80,
  };
});

function ConfettiPiece({ piece }: { piece: Piece }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withRepeat(
        withTiming(1, {
          duration: piece.duration,
          easing: Easing.linear,
        }),
        -1,
        false
      )
    );
  }, [piece.delay, piece.duration, progress]);

  const style = useAnimatedStyle(() => {
    const translateY = -40 + progress.value * (SCREEN_H + 80);
    const translateX = progress.value * piece.drift;
    const rotate = piece.rotateDir * progress.value * 720; // 2 full spins
    return {
      transform: [
        { translateX },
        { translateY },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: piece.startX,
          top: 0,
          width: piece.size,
          height: piece.shape === "rect" ? piece.size / 2 : piece.size,
          backgroundColor: piece.color,
          borderRadius: piece.shape === "circle" ? piece.size : 1,
        },
        style,
      ]}
    />
  );
}

function AnimatedConfetti() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PIECES.map((p, i) => (
        <ConfettiPiece key={i} piece={p} />
      ))}
    </View>
  );
}

export function MatchModal({
  visible,
  matchedName,
  matchedPhoto,
  activityPhotoUrl,
  activityTitle,
  activityDateLabel,
  activityLocationLabel,
  yourPhoto,
  yourName = "You",
  onSayHi,
  onKeepBrowsing,
  onAddToCalendar,
}: MatchModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <LinearGradient
        colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        {/* Soft radial bloom overlay */}
        <View style={styles.bloom} pointerEvents="none" />

        {/* Top-right close */}
        <Pressable onPress={onKeepBrowsing} style={styles.closeBtn} hitSlop={8}>
          <Icon name="X" size={18} color="#FFFFFF" weight="bold" />
        </Pressable>

        {/* Headline */}
        <View style={styles.headline}>
          <Text style={styles.eyebrow}>You're in</Text>
          <Text style={styles.title}>it's a plan!</Text>
        </View>

        {/* Activity hero */}
        <View style={styles.heroFrame}>
          {activityPhotoUrl ? (
            <Image
              source={{ uri: activityPhotoUrl }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={[colors.primary.deepViolet, colors.secondary.wannaTeal]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroImage}
            />
          )}
          {/* Gradient scrim under title */}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]}
            locations={[0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {activityTitle}
            </Text>
            {(activityDateLabel || activityLocationLabel) && (
              <View style={styles.heroMetaRow}>
                {activityDateLabel ? (
                  <View style={styles.heroMetaItem}>
                    <Icon name="CalendarBlank" size={12} color="#FFFFFF" weight="bold" />
                    <Text style={styles.heroMetaText}>{activityDateLabel}</Text>
                  </View>
                ) : null}
                {activityLocationLabel ? (
                  <View style={styles.heroMetaItem}>
                    <Icon name="MapPin" size={12} color="#FFFFFF" weight="bold" />
                    <Text style={styles.heroMetaText} numberOfLines={1}>
                      {activityLocationLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </View>

        {/* Two avatars connected by a heart — profile is small, secondary */}
        <View style={styles.avatarRow}>
          <Avatar name={yourName} uri={yourPhoto} size={40} ring />
          <View style={styles.connector} />
          <View style={styles.heartCircle}>
            <Icon name="Heart" size={18} color="#FF5C7A" weight="fill" />
          </View>
          <View style={styles.connector} />
          <Avatar name={matchedName} uri={matchedPhoto} size={40} ring />
        </View>
        <Text style={styles.connectorCaption}>
          <Text style={styles.connectorBold}>{matchedName}</Text> wants to do this with you
        </Text>

        {/* CTAs */}
        <View style={styles.actions}>
          <Pressable onPress={onSayHi} style={styles.primaryCta}>
            <Icon name="ChatCircle" size={18} color={colors.neutral.charcoal} weight="bold" />
            <Text style={styles.primaryCtaText}>
              Send {matchedName} a message
            </Text>
          </Pressable>
          {onAddToCalendar && (
            <Pressable onPress={onAddToCalendar} style={styles.secondaryCta}>
              <Icon name="CalendarPlus" size={16} color="#FFFFFF" weight="bold" />
              <Text style={styles.secondaryCtaText}>Add to calendar</Text>
            </Pressable>
          )}
        </View>

        {/* Keep browsing — bottom anchor */}
        <Pressable onPress={onKeepBrowsing} style={styles.keepBrowsing} hitSlop={6}>
          <Text style={styles.keepBrowsingText}>Keep swiping plans</Text>
        </Pressable>

        {/* Foreground confetti — rendered last so it sits ON TOP of the
            content. pointerEvents=none keeps the CTAs tappable. */}
        {visible ? <AnimatedConfetti /> : null}
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  bloom: {
    position: "absolute",
    top: -100,
    left: -50,
    right: -50,
    height: 400,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 9999,
    transform: [{ scaleX: 1.5 }],
    opacity: 0.4,
  },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  headline: {
    alignItems: "center",
    marginTop: 8,
  },
  eyebrow: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    opacity: 0.85,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 42,
    letterSpacing: -1.2,
    lineHeight: 44,
    marginTop: 4,
  },
  heroFrame: {
    marginTop: 14,
    height: 280,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.85)",
    overflow: "hidden",
    ...shadows.lg,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.4,
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 6,
  },
  heroMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroMetaText: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontWeight: "600",
    fontSize: 12,
    opacity: 0.95,
  },

  avatarRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  connector: {
    width: 20,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  heartCircle: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  connectorCaption: {
    marginTop: 6,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 12,
    opacity: 0.95,
  },
  connectorBold: {
    fontFamily: fonts.heading,
    fontWeight: "700",
  },

  actions: {
    marginTop: 18,
    gap: 8,
  },
  primaryCta: {
    height: 46,
    borderRadius: 9999,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...shadows.md,
  },
  primaryCtaText: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 15,
    color: colors.neutral.charcoal,
  },
  secondaryCta: {
    height: 42,
    borderRadius: 9999,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryCtaText: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
  },

  keepBrowsing: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 28,
    paddingVertical: 8,
    alignItems: "center",
  },
  keepBrowsingText: {
    fontFamily: fonts.heading,
    fontWeight: "800",
    fontSize: 16,
    color: "#FFFFFF",
  },
});
