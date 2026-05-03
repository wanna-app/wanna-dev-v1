import React, { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme";

interface Props {
  /** Resolved photo URLs in display order. Empty array shows the brand
   *  gradient placeholder. */
  urls: (string | null)[];
  /** Photo container height. */
  height: number;
  /** Optional overlay rendered over the image (gradient scrims, name
   *  block, badges). pointerEvents="none" recommended on the overlay so
   *  the tap-zones still receive presses. */
  overlay?: React.ReactNode;
}

/**
 * Photo carousel with tap-left / tap-right zones to cycle through. Used
 * on Profile, UserProfile, and any other screen where a user's photo
 * grid is the hero. Photo dots indicator floats at top.
 */
export function PhotoCarousel({ urls, height, overlay }: Props) {
  const [index, setIndex] = useState(0);
  const count = urls.length;

  const goPrev = () => {
    if (count === 0) return;
    setIndex((i) => (i - 1 + count) % count);
  };
  const goNext = () => {
    if (count === 0) return;
    setIndex((i) => (i + 1) % count);
  };

  const current = urls[index];

  return (
    <View style={[styles.box, { height }]}>
      {current ? (
        <Image source={{ uri: current }} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient
          colors={[colors.primary.softViolet, colors.secondary.wannaCyan]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Photo dots — top, fixed above any overlay */}
      {count > 1 && (
        <View style={styles.dotsRow} pointerEvents="none">
          {urls.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      )}

      {overlay}

      {/* Tap zones — left half = previous, right half = next. Sits ABOVE
          any non-interactive overlay (since overlay should set
          pointerEvents="none"). */}
      {count > 1 && (
        <>
          <Pressable
            onPress={goPrev}
            style={[styles.tapZone, styles.leftZone]}
          />
          <Pressable
            onPress={goNext}
            style={[styles.tapZone, styles.rightZone]}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    backgroundColor: colors.primary.deepViolet,
    position: "relative",
    overflow: "hidden",
  },
  dotsRow: {
    position: "absolute",
    top: 56,
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 4,
    zIndex: 5,
  },
  dot: {
    flex: 1,
    height: 3,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotActive: { backgroundColor: "#FFFFFF" },

  tapZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "50%",
  },
  leftZone: { left: 0 },
  rightZone: { right: 0 },
});
