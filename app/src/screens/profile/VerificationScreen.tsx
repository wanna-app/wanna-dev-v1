import React, { useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { Button } from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { uploadVerificationSelfie } from "../../lib/photoUpload";
import { track } from "../../lib/analytics";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

export function VerificationScreen({ navigation }: { navigation: any }) {
  const { user, refreshProfile } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retakes, setRetakes] = useState(0);
  const [startTime] = useState(() => Date.now());

  const takeSelfie = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (photo?.uri) setCaptured(photo.uri);
    } catch (e: any) {
      Alert.alert("Couldn't capture", e.message ?? String(e));
    }
  };

  const retake = () => {
    setRetakes((r) => r + 1);
    setCaptured(null);
  };

  const submit = async () => {
    if (!user || !captured) return;
    setSubmitting(true);
    try {
      const path = await uploadVerificationSelfie(captured, user.id);
      const { error } = await supabase
        .from("profiles")
        .update({ verification_photo_url: path })
        .eq("id", user.id);
      if (error) throw error;
      track("verification_submitted", {
        time_to_capture_ms: Date.now() - startTime,
        retakes,
      });
      await refreshProfile();
      Alert.alert(
        "Submitted",
        "Our team will review within 24 hours. We'll notify you when you're verified.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert("Couldn't submit", e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.permText}>Loading camera…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permWrapper}>
          <Text style={styles.permTitle}>Camera permission needed</Text>
          <Text style={styles.permText}>
            We need camera access to verify your photo. Verification selfies are
            private and only seen by our moderation team.
          </Text>
          <Button
            label="Grant access"
            variant="gradient"
            onPress={() => requestPermission()}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {captured ? (
        <View style={{ flex: 1 }}>
          <Image source={{ uri: captured }} style={styles.preview} />
          <SafeAreaView style={styles.previewActions} edges={["bottom"]}>
            <Button label="Retake" variant="outline" onPress={retake} />
            <View style={{ height: spacing.sm }} />
            <Button
              label={submitting ? "Submitting…" : "Submit for review"}
              variant="gradient"
              onPress={submit}
              loading={submitting}
            />
          </SafeAreaView>
        </View>
      ) : (
        <>
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />
          <SafeAreaView style={styles.cameraOverlay} edges={["top", "bottom"]}>
            <View style={styles.referenceCard}>
              <Text style={styles.referenceTitle}>Match the pose 👋</Text>
              <Text style={styles.referenceSubtitle}>
                Hand up next to your face, look at the camera, neutral expression.
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable onPress={takeSelfie} style={styles.shutter}>
              <View style={styles.shutterInner} />
            </Pressable>
            <Pressable onPress={() => navigation.goBack()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </SafeAreaView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.black },
  permWrapper: {
    flex: 1,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neutral.white,
  },
  permTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  permText: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
    lineHeight: 22,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  referenceCard: {
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: "center",
  },
  referenceTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.white,
    marginBottom: spacing.xs,
  },
  referenceSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.neutral.white,
    opacity: 0.85,
    textAlign: "center",
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderWidth: 4,
    borderColor: colors.neutral.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.neutral.white,
  },
  cancelText: {
    color: colors.neutral.white,
    fontSize: fontSizes.body,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  preview: { width: "100%", height: "100%" },
  previewActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
});
