import React from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, shadows } from "../theme";

interface SimpleSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (v: number) => void;
}

const TRACK_HEIGHT = 6;
const THUMB_SIZE = 26;

/**
 * Pure JS slider — built on react-native-gesture-handler + reanimated
 * so it doesn't require the native @react-native-community/slider
 * module (which won't load in Expo Go without a custom dev client).
 *
 * Drag the thumb or tap anywhere on the track to set the value. The
 * inner shared values track the current x-offset; on release we round
 * to `step` and bubble the new value back via `onValueChange`.
 */
export function SimpleSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
}: SimpleSliderProps) {
  const trackWidth = useSharedValue(0);
  const thumbX = useSharedValue(0);

  // Sync external value changes back into the shared offset (e.g. when
  // the parent resets via a "Clear" button or initial-load fetch).
  React.useEffect(() => {
    if (trackWidth.value > 0) {
      const ratio = (value - min) / (max - min);
      thumbX.value = ratio * trackWidth.value;
    }
  }, [value, min, max, trackWidth, thumbX]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWidth.value = w;
    const ratio = (value - min) / (max - min);
    thumbX.value = ratio * w;
  };

  const commit = (xRaw: number) => {
    const w = trackWidth.value;
    if (w <= 0) return;
    const clamped = Math.max(0, Math.min(w, xRaw));
    const ratio = clamped / w;
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    onValueChange(Math.max(min, Math.min(max, stepped)));
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      thumbX.value = Math.max(0, Math.min(trackWidth.value, e.x));
      runOnJS(commit)(e.x);
    })
    .onUpdate((e) => {
      thumbX.value = Math.max(0, Math.min(trackWidth.value, e.x));
    })
    .onEnd((e) => {
      runOnJS(commit)(e.x);
    });

  const tap = Gesture.Tap().onEnd((e, success) => {
    if (success) {
      thumbX.value = withSpring(
        Math.max(0, Math.min(trackWidth.value, e.x)),
        { damping: 18, stiffness: 220 }
      );
      runOnJS(commit)(e.x);
    }
  });

  const composed = Gesture.Race(pan, tap);

  const fillStyle = useAnimatedStyle(() => ({
    width: thumbX.value,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value - THUMB_SIZE / 2 }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={styles.touchArea}>
        <View style={styles.track} onLayout={onTrackLayout}>
          <Animated.View style={[styles.fill, fillStyle]} />
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // Wider hit area than the visible track so finger drags feel
  // responsive without having to land on the thin bar exactly.
  touchArea: {
    height: 36,
    justifyContent: "center",
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT,
    backgroundColor: colors.neutral.cloud,
    overflow: "visible",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT,
    backgroundColor: colors.primary.wannaPurple,
  },
  thumb: {
    position: "absolute",
    top: -((THUMB_SIZE - TRACK_HEIGHT) / 2),
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 9999,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: colors.primary.wannaPurple,
    ...shadows.sm,
  },
});
