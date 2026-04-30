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
import { UserCard } from "./UserCard";
import type { InterestedUser } from "../types/whosin";
import { borderRadius, fontSizes, spacing, fonts } from "../theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.4;
const FLY_AWAY_X = SCREEN_WIDTH * 1.5;

interface SwipeableUserCardProps {
  user: InterestedUser;
  sharedPreferences?: string[];
  onSwiped: (direction: "accept" | "reject") => void;
}

export function SwipeableUserCard({
  user,
  sharedPreferences,
  onSwiped,
}: SwipeableUserCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const finishSwipe = (direction: "accept" | "reject") => {
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
        const direction = x > 0 ? "accept" : "reject";
        const target = direction === "accept" ? FLY_AWAY_X : -FLY_AWAY_X;
        translateX.value = withTiming(target, { duration: 250 }, () => {
          runOnJS(finishSwipe)(direction);
        });
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

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

  const acceptOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const rejectOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <UserCard user={user} sharedPreferences={sharedPreferences} />
        <Animated.View
          style={[styles.overlay, styles.acceptOverlay, acceptOverlayStyle]}
          pointerEvents="none"
        >
          <View style={[styles.stamp, styles.acceptStamp]}>
            <Animated.Text style={[styles.stampText, styles.acceptStampText]}>
              MATCH
            </Animated.Text>
          </View>
        </Animated.View>
        <Animated.View
          style={[styles.overlay, styles.rejectOverlay, rejectOverlayStyle]}
          pointerEvents="none"
        >
          <View style={[styles.stamp, styles.rejectStamp]}>
            <Animated.Text style={[styles.stampText, styles.rejectStampText]}>
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
    paddingTop: 80,
  },
  acceptOverlay: {
    alignItems: "flex-start",
    paddingLeft: spacing.lg,
  },
  rejectOverlay: {
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
  acceptStamp: {
    borderColor: "#3FBD6E",
    backgroundColor: "rgba(63, 189, 110, 0.15)",
  },
  rejectStamp: {
    borderColor: "#E53E3E",
    backgroundColor: "rgba(229, 62, 62, 0.15)",
    transform: [{ rotate: "15deg" }],
  },
  stampText: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    letterSpacing: 2,
  },
  acceptStampText: {
    color: "#3FBD6E",
  },
  rejectStampText: {
    color: "#E53E3E",
  },
});
