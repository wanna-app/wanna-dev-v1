import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ActivityCard } from "./ActivityCard";
import type { FeedCard } from "../types/feed";
import { colors, borderRadius, fontSizes, spacing, fonts } from "../theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.4;
const FLY_AWAY_X = SCREEN_WIDTH * 1.5;

interface SwipeableCardProps {
  /** Host strip tap on the card — navigates to the poster's profile. */
  onHostPress?: () => void;
  card: FeedCard;
  onSwiped: (direction: "like" | "pass") => void;
  onTap?: () => void;
}

export function SwipeableCard({
  card,
  onSwiped,
  onTap,
  onHostPress,
}: SwipeableCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const finishSwipe = (direction: "like" | "pass") => {
    onSwiped(direction);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.5;
    })
    .onEnd((e) => {
      const x = e.translationX;
      if (Math.abs(x) > SWIPE_THRESHOLD || Math.abs(e.velocityX) > 800) {
        const direction = x > 0 ? "like" : "pass";
        const target = direction === "like" ? FLY_AWAY_X : -FLY_AWAY_X;
        translateX.value = withTiming(target, { duration: 250 }, () => {
          runOnJS(finishSwipe)(direction);
        });
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd(() => {
      if (onTap) runOnJS(onTap)();
    });

  const composed = Gesture.Race(pan, tap);

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      [-15, 0, 15],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const likeOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const passOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.card, cardStyle]}>
        <ActivityCard
          card={card}
          onHostPress={onHostPress}
        />
        <Animated.View
          style={[styles.overlay, styles.likeOverlay, likeOverlayStyle]}
          pointerEvents="none"
        >
          <View style={[styles.stamp, styles.likeStamp]}>
            <Animated.Text style={[styles.stampText, styles.likeStampText]}>
              I'M IN
            </Animated.Text>
          </View>
        </Animated.View>
        <Animated.View
          style={[styles.overlay, styles.passOverlay, passOverlayStyle]}
          pointerEvents="none"
        >
          <View style={[styles.stamp, styles.passStamp]}>
            <Animated.Text style={[styles.stampText, styles.passStampText]}>
              PASS
            </Animated.Text>
          </View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 80,
  },
  likeOverlay: {
    alignItems: "flex-start",
    paddingLeft: spacing.lg,
  },
  passOverlay: {
    alignItems: "flex-end",
    paddingRight: spacing.lg,
  },
  stamp: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 4,
    transform: [{ rotate: "-15deg" }],
  },
  likeStamp: {
    borderColor: "#3FBD6E",
    backgroundColor: "rgba(63, 189, 110, 0.15)",
  },
  passStamp: {
    borderColor: "#E53E3E",
    backgroundColor: "rgba(229, 62, 62, 0.15)",
    transform: [{ rotate: "15deg" }],
  },
  stampText: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    letterSpacing: 2,
  },
  likeStampText: {
    color: "#3FBD6E",
  },
  passStampText: {
    color: "#E53E3E",
  },
});
