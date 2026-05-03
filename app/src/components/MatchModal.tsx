import React from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Polygon, Rect } from "react-native-svg";
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

// ─── Confetti SVG (mockup pattern; static positions) ─────────────────
const CONFETTI: Array<
  [number, number, string, "c" | "r" | "t" | "s", number, number?]
> = [
  [38, 92, "#FFE7B0", "r", 10, -22],
  [82, 150, "#FF5C7A", "c", 5],
  [128, 78, "#86E2EB", "t", 9, 18],
  [180, 124, "#FFD93D", "r", 12, 35],
  [222, 64, "#FF5C7A", "s", 18, 12],
  [276, 142, "#86E2EB", "c", 4],
  [318, 92, "#B388FF", "r", 9, -15],
  [358, 158, "#FFE7B0", "t", 8, 40],
  [60, 220, "#86E2EB", "r", 11, 25],
  [128, 268, "#FFD93D", "c", 5],
  [200, 232, "#FF5C7A", "s", 16, -28],
  [274, 282, "#FFFFFF", "c", 4],
  [332, 230, "#FFE7B0", "t", 9, -12],
  [372, 296, "#B388FF", "r", 8, 18],
  [44, 360, "#FF5C7A", "r", 11, -32],
  [110, 412, "#86E2EB", "s", 17, 42],
  [184, 376, "#FFD93D", "c", 5],
  [256, 426, "#FFFFFF", "r", 7, 22],
  [322, 384, "#FF5C7A", "t", 9, -8],
  [364, 458, "#FFE7B0", "c", 4],
  [62, 506, "#B388FF", "s", 18, 14],
  [138, 540, "#86E2EB", "r", 12, -28],
  [212, 502, "#FFD93D", "t", 9, 30],
  [288, 562, "#FF5C7A", "c", 5],
  [350, 530, "#FFFFFF", "r", 8, -20],
  [42, 612, "#FFE7B0", "t", 8, 22],
  [104, 656, "#FF5C7A", "c", 6],
  [184, 624, "#86E2EB", "s", 17, -36],
  [254, 676, "#FFD93D", "r", 10, 16],
  [328, 642, "#B388FF", "c", 4],
  [368, 712, "#FF5C7A", "t", 9, -18],
  [60, 760, "#86E2EB", "r", 11, 28],
  [148, 740, "#FFE7B0", "c", 5],
  [222, 798, "#FFD93D", "s", 15, 8],
  [296, 758, "#FF5C7A", "r", 8, -22],
  [358, 800, "#FFFFFF", "t", 7, 12],
  // Sparkle dots
  [200, 100, "#FFFFFF", "c", 2.5],
  [70, 280, "#FFFFFF", "c", 2.5],
  [340, 350, "#FFFFFF", "c", 2.5],
  [120, 480, "#FFFFFF", "c", 2.5],
  [260, 560, "#FFFFFF", "c", 2.5],
  [40, 660, "#FFFFFF", "c", 2.5],
  [380, 600, "#FFFFFF", "c", 2.5],
];

function ConfettiSvg() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 402 874"
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {CONFETTI.map((p, i) => {
        const [x, y, c, type, size, rot = 0] = p;
        const transform = `rotate(${rot} ${x} ${y})`;
        if (type === "c") return <Circle key={i} cx={x} cy={y} r={size} fill={c} />;
        if (type === "r")
          return (
            <Rect
              key={i}
              x={x - size / 2}
              y={y - size / 4}
              width={size}
              height={size / 2}
              rx={1}
              fill={c}
              transform={transform}
            />
          );
        if (type === "t") {
          const pts = `${x},${y - size / 2} ${x + size / 2},${y + size / 2} ${x - size / 2},${y + size / 2}`;
          return <Polygon key={i} points={pts} fill={c} transform={transform} />;
        }
        // streamer
        return (
          <Rect
            key={i}
            x={x - size / 2}
            y={y - 1.5}
            width={size}
            height={3}
            rx={1.5}
            fill={c}
            transform={transform}
          />
        );
      })}
    </Svg>
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
        <ConfettiSvg />

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
