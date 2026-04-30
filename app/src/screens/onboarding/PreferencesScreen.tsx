import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../hooks/useOnboarding";
import { useAuth } from "../../hooks/useAuth";
import { ACTIVITY_CATEGORIES } from "../../constants/categories";
import { supabase } from "../../lib/supabase";
import { colors, spacing, fontSizes } from "../../theme";

interface Props {
  navigation: any;
}

const MAX_PREFERENCES = 10;

async function uploadPhoto(uri: string, userId: string, index: number): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = uri.split(".").pop()?.split("?")[0] || "jpg";
  const path = `${userId}/${Date.now()}_${index}.${ext}`;

  const arrayBuffer = await new Response(blob).arrayBuffer();
  const { error } = await supabase.storage
    .from("profile-photos")
    .upload(path, arrayBuffer, {
      contentType: blob.type || "image/jpeg",
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export function PreferencesScreen({ navigation }: Props) {
  const { data, update, reset } = useOnboarding();
  const { user, refreshProfile } = useAuth();
  const [selected, setSelected] = useState<string[]>(data.activity_preferences);
  const [submitting, setSubmitting] = useState(false);

  const toggle = (cat: string) => {
    setSelected((prev) => {
      if (prev.includes(cat)) return prev.filter((c) => c !== cat);
      if (prev.length >= MAX_PREFERENCES) return prev;
      return [...prev, cat];
    });
  };

  const handleFinish = async () => {
    if (selected.length < 1) {
      Alert.alert("Pick at least one", "Choose what you're into.");
      return;
    }
    if (!user) {
      Alert.alert("Not signed in", "Please sign in again.");
      return;
    }

    setSubmitting(true);
    try {
      const photoUrls: string[] = [];
      for (let i = 0; i < data.photos.length; i++) {
        try {
          const path = await uploadPhoto(data.photos[i], user.id, i);
          photoUrls.push(path);
        } catch (e) {
          console.warn("Photo upload failed, using local URI:", e);
          photoUrls.push(data.photos[i]);
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: data.first_name,
          date_of_birth: data.date_of_birth,
          gender: data.gender,
          photos: photoUrls,
          activity_preferences: selected,
          bio: data.bio || null,
          profession: data.profession || null,
          university: data.university || null,
          political_orientation: data.political_orientation,
          alcohol: data.alcohol,
          marijuana: data.marijuana,
          star_sign: data.star_sign,
        })
        .eq("id", user.id);

      if (error) throw error;

      reset();
      await refreshProfile();
    } catch (e: any) {
      Alert.alert("Couldn't save profile", e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <ProgressBar step={6} totalSteps={6} />
        <Text style={styles.title}>What are you into?</Text>
        <Text style={styles.subtitle}>
          Pick 1–10. We'll prioritize activities that match your interests.
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.chipsScroll}>
        <View style={styles.chips}>
          {ACTIVITY_CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              selected={selected.includes(cat)}
              onPress={() => toggle(cat)}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={submitting ? "Setting up..." : `Finish (${selected.length}/${MAX_PREFERENCES})`}
          variant="gradient"
          onPress={handleFinish}
          loading={submitting}
          disabled={selected.length < 1}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  header: {
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSizes.display,
    fontWeight: "800",
    color: colors.neutral.charcoal,
    marginTop: spacing.lg,
  },
  subtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    marginTop: spacing.sm,
  },
  chipsScroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.cloud,
  },
});
