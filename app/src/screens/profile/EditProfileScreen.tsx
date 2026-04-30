import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { uploadProfilePhoto } from "../../lib/photoUpload";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import { track } from "../../lib/analytics";
import { ACTIVITY_CATEGORIES } from "../../constants/categories";
import {
  FREQUENCY_OPTIONS,
  POLITICAL_ORIENTATIONS,
  STAR_SIGNS,
  type FrequencyOption,
  type PoliticalOrientation,
  type StarSign,
} from "../../constants/enums";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

const MAX_PHOTOS = 6;
const MAX_PREFERENCES = 10;

export function EditProfileScreen({ navigation }: { navigation: any }) {
  const { user, profile, refreshProfile } = useAuth();

  const [bio, setBio] = useState(profile?.bio ?? "");
  const [profession, setProfession] = useState(profile?.profession ?? "");
  const [university, setUniversity] = useState(profile?.university ?? "");
  const [politicalOrientation, setPoliticalOrientation] =
    useState<PoliticalOrientation | null>(
      profile?.political_orientation ?? null
    );
  const [alcohol, setAlcohol] = useState<FrequencyOption | null>(
    profile?.alcohol ?? null
  );
  const [marijuana, setMarijuana] = useState<FrequencyOption | null>(
    profile?.marijuana ?? null
  );
  const [starSign, setStarSign] = useState<StarSign | null>(
    profile?.star_sign ?? null
  );
  const [preferences, setPreferences] = useState<string[]>(
    profile?.activity_preferences ?? []
  );
  const [photoPaths, setPhotoPaths] = useState<string[]>(profile?.photos ?? []);
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all(photoPaths.map(resolveProfilePhotoUrl)).then(setPhotoUrls);
  }, [photoPaths]);

  const togglePref = (cat: string) => {
    setPreferences((prev) => {
      if (prev.includes(cat)) return prev.filter((c) => c !== cat);
      if (prev.length >= MAX_PREFERENCES) return prev;
      return [...prev, cat];
    });
  };

  const addPhoto = async () => {
    if (photoPaths.length >= MAX_PHOTOS) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "We need photo library access to upload."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 5],
    });
    if (result.canceled || !user) return;
    try {
      const path = await uploadProfilePhoto(
        result.assets[0].uri,
        user.id,
        photoPaths.length
      );
      track("photo_uploaded", {
        photo_position: photoPaths.length,
        format: result.assets[0].uri.split(".").pop(),
      });
      setPhotoPaths((prev) => [...prev, path]);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? String(e));
    }
  };

  const removePhoto = (i: number) => {
    setPhotoPaths((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleReorder = (newPaths: string[]) => {
    setPhotoPaths(newPaths);
  };

  const handleSave = async () => {
    if (!user) return;
    if (photoPaths.length < 1) {
      Alert.alert("At least one photo required");
      return;
    }
    if (preferences.length < 1) {
      Alert.alert("Pick at least one interest");
      return;
    }
    setSaving(true);

    const before = profile;
    const updates = {
      bio: bio.trim() || null,
      profession: profession.trim() || null,
      university: university.trim() || null,
      political_orientation: politicalOrientation,
      alcohol,
      marijuana,
      star_sign: starSign,
      activity_preferences: preferences,
      photos: photoPaths,
    };
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    track("profile_edited", {
      fields_changed: Object.keys(updates),
      photo_count_before: before?.photos.length ?? 0,
      photo_count_after: photoPaths.length,
    });
    await refreshProfile();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit profile</Text>
        <Pressable onPress={handleSave} style={styles.headerBtn} disabled={saving}>
          <Text style={[styles.saveText, saving && { opacity: 0.5 }]}>
            {saving ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photos */}
          <Section title={`Photos (${photoPaths.length}/${MAX_PHOTOS})`}>
            <Text style={styles.photoHint}>
              Hold and drag to reorder. First photo is your primary.
            </Text>
            <DraggableFlatList
              horizontal
              data={photoPaths}
              keyExtractor={(item, idx) => `${item}-${idx}`}
              onDragEnd={({ data }) => handleReorder(data)}
              activationDistance={8}
              contentContainerStyle={styles.photoListContent}
              ListFooterComponent={
                photoPaths.length < MAX_PHOTOS ? (
                  <Pressable style={styles.addPhotoSlot} onPress={addPhoto}>
                    <Text style={styles.addPhotoIcon}>+</Text>
                  </Pressable>
                ) : null
              }
              renderItem={(params) => (
                <PhotoCell
                  {...params}
                  index={photoPaths.indexOf(params.item)}
                  url={
                    photoUrls[photoPaths.indexOf(params.item)] ?? null
                  }
                  onRemove={() =>
                    removePhoto(photoPaths.indexOf(params.item))
                  }
                />
              )}
            />
          </Section>

          {/* Bio */}
          <Section title="Bio">
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="A short line about you (max 150)"
              placeholderTextColor={colors.neutral.slate}
              style={styles.textArea}
              multiline
              maxLength={150}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{bio.length}/150</Text>
          </Section>

          {/* Activity preferences */}
          <Section title={`Into (${preferences.length}/${MAX_PREFERENCES})`}>
            <View style={styles.chipsRow}>
              {ACTIVITY_CATEGORIES.map((cat) => (
                <Chip
                  key={cat}
                  label={cat}
                  selected={preferences.includes(cat)}
                  onPress={() => togglePref(cat)}
                />
              ))}
            </View>
          </Section>

          {/* Optional details */}
          <Section title="Profession">
            <TextInput
              value={profession}
              onChangeText={setProfession}
              placeholder="What do you do?"
              placeholderTextColor={colors.neutral.slate}
              style={styles.input}
              maxLength={60}
            />
          </Section>

          <Section title="University">
            <TextInput
              value={university}
              onChangeText={setUniversity}
              placeholder="Where did you study?"
              placeholderTextColor={colors.neutral.slate}
              style={styles.input}
              maxLength={100}
            />
          </Section>

          <Section title="Politics">
            <View style={styles.chipsRow}>
              {POLITICAL_ORIENTATIONS.map((p) => (
                <Chip
                  key={p}
                  label={
                    p === "liberal"
                      ? "Liberal"
                      : p === "moderate"
                        ? "Moderate"
                        : "Conservative"
                  }
                  selected={politicalOrientation === p}
                  onPress={() =>
                    setPoliticalOrientation(politicalOrientation === p ? null : p)
                  }
                />
              ))}
            </View>
          </Section>

          <Section title="Alcohol">
            <View style={styles.chipsRow}>
              {FREQUENCY_OPTIONS.map((f) => (
                <Chip
                  key={f}
                  label={f.charAt(0).toUpperCase() + f.slice(1)}
                  selected={alcohol === f}
                  onPress={() => setAlcohol(alcohol === f ? null : f)}
                />
              ))}
            </View>
          </Section>

          <Section title="420">
            <View style={styles.chipsRow}>
              {FREQUENCY_OPTIONS.map((f) => (
                <Chip
                  key={f}
                  label={f.charAt(0).toUpperCase() + f.slice(1)}
                  selected={marijuana === f}
                  onPress={() => setMarijuana(marijuana === f ? null : f)}
                />
              ))}
            </View>
          </Section>

          <Section title="Star sign">
            <View style={styles.chipsRow}>
              {STAR_SIGNS.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  selected={starSign === s}
                  onPress={() => setStarSign(starSign === s ? null : s)}
                />
              ))}
            </View>
          </Section>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PhotoCell({
  item,
  drag,
  isActive,
  index,
  url,
  onRemove,
}: RenderItemParams<string> & {
  index: number;
  url: string | null;
  onRemove: () => void;
}) {
  return (
    <ScaleDecorator>
      <Pressable
        onLongPress={drag}
        delayLongPress={120}
        disabled={isActive}
        style={[styles.photoSlot, isActive && styles.photoSlotActive]}
      >
        {url && <Image source={{ uri: url }} style={styles.photoImg} />}
        {index === 0 && (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>Primary</Text>
          </View>
        )}
        <Pressable
          onPress={onRemove}
          style={styles.removePhotoBtn}
          hitSlop={8}
        >
          <Text style={styles.removePhotoText}>×</Text>
        </Pressable>
        <View style={styles.dragHandle}>
          <Text style={styles.dragHandleIcon}>⠿</Text>
        </View>
      </Pressable>
    </ScaleDecorator>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  headerBtn: { paddingHorizontal: spacing.sm, minWidth: 60 },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.charcoal,
  },
  cancelText: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  saveText: {
    fontSize: fontSizes.body,
    color: colors.primary.wannaPurple,
    fontWeight: "700",
    textAlign: "right",
  },
  scroll: { padding: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: fontSizes.body,
    fontWeight: "700",
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  photoHint: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginBottom: spacing.sm,
  },
  photoListContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  photoSlot: {
    width: 110,
    aspectRatio: 4 / 5,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral.cloud,
    overflow: "hidden",
    position: "relative",
    marginRight: spacing.sm,
  },
  photoSlotActive: {
    shadowColor: colors.neutral.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  photoImg: { width: "100%", height: "100%" },
  primaryBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: colors.primary.wannaPurple,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  primaryBadgeText: {
    color: colors.neutral.white,
    fontSize: 10,
    fontWeight: "700",
  },
  removePhotoBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  removePhotoText: {
    color: colors.neutral.white,
    fontSize: 16,
    lineHeight: 18,
  },
  dragHandle: {
    position: "absolute",
    bottom: 6,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dragHandleIcon: {
    color: colors.neutral.white,
    fontSize: 18,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 3,
  },
  addPhotoSlot: {
    width: 110,
    aspectRatio: 4 / 5,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral.cloud,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.neutral.slate,
  },
  addPhotoIcon: {
    fontSize: 36,
    color: colors.primary.wannaPurple,
  },
  textArea: {
    minHeight: 80,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  charCount: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    textAlign: "right",
    marginTop: spacing.xs,
  },
  input: {
    height: 52,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
