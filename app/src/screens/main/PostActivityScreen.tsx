import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Modal } from "../../components/Modal";
import { PhotoStep } from "../../components/PhotoStep";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { track } from "../../lib/analytics";
import {
  ACTIVITY_CATEGORIES,
  ActivityCategory,
  CATEGORY_EMOJI,
} from "../../constants/categories";
import { Intent } from "../../constants/enums";
import {
  categoryGradients,
  colors,
  spacing,
  borderRadius,
  fontSizes,
  fonts,
} from "../../theme";
import type {
  PhotoSource,
  UnsplashAttribution,
} from "../../types/database";

interface PhotoState {
  url: string | null;
  source: PhotoSource | null;
  attribution: UnsplashAttribution | null;
  uploadPath: string | null;
}

const MAX_ACTIVE_ACTIVITIES = 5;
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 1000;
const LOCATION_NAME_MAX = 120;
const LINK_MAX = 500;

type SafetyModal = "none" | "educational" | "confirmation";

export function PostActivityScreen({ navigation }: { navigation: any }) {
  const { user, profile, refreshProfile } = useAuth();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ActivityCategory | null>(null);
  // Multi-mode (E3) — at least one must be selected. Default 'friends'.
  const [intents, setIntents] = useState<Intent[]>(["friends"]);
  const [locationName, setLocationName] = useState("");
  const [link, setLink] = useState("");
  const [hasDate, setHasDate] = useState(false);
  const [photo, setPhoto] = useState<PhotoState>({
    url: null,
    source: null,
    attribution: null,
    uploadPath: null,
  });
  const [activityDate, setActivityDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });

  // UX state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [safetyModal, setSafetyModal] = useState<SafetyModal>("none");
  const [createStartTime] = useState(() => Date.now());

  useEffect(() => {
    fetchActiveCount();
  }, []);

  const fetchActiveCount = async () => {
    if (!user) return;
    const { count } = await supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active");
    setActiveCount(count ?? 0);
  };

  const filledFields = useMemo(() => {
    const f: string[] = [];
    if (title) f.push("title");
    if (description) f.push("description");
    if (category) f.push("category");
    if (intents.length > 0) f.push("intents");
    if (locationName) f.push("location");
    if (hasDate) f.push("date");
    return f;
  }, [title, description, category, intents, locationName, hasDate]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > TITLE_MAX) {
      e.title = `Title must be 1–${TITLE_MAX} characters`;
    }
    if (!category) e.category = "Pick a category";
    if (description.length > DESCRIPTION_MAX) {
      e.description = `Max ${DESCRIPTION_MAX} characters`;
    }
    if (locationName.length > LOCATION_NAME_MAX) {
      e.locationName = `Max ${LOCATION_NAME_MAX} characters`;
    }
    const trimmedLink = link.trim();
    if (trimmedLink) {
      if (trimmedLink.length > LINK_MAX) {
        e.link = `Max ${LINK_MAX} characters`;
      } else if (!/^https?:\/\//i.test(trimmedLink)) {
        e.link = "Must start with http:// or https://";
      }
    }
    if (hasDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (activityDate < today) {
        e.activityDate = "Date must be today or later";
      }
    }
    if (!photo.url || !photo.source) {
      e.photo = "Pick a hero photo for your activity";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (activeCount !== null && activeCount >= MAX_ACTIVE_ACTIVITIES) {
      Alert.alert(
        "Limit reached",
        `You can have up to ${MAX_ACTIVE_ACTIVITIES} active activities at a time. Delete one to post a new one.`
      );
      return;
    }
    if (!profile?.has_seen_public_safety) {
      track("public_safety_popup_shown");
      setSafetyModal("educational");
    } else {
      setSafetyModal("confirmation");
    }
  };

  const publishActivity = async (isFirst: boolean) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const insert = {
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        category,
        // Legacy single-intent column kept for backwards compat. Use the
        // first selected intent so any old reader still works. New reads
        // should use `intents` instead.
        intent: intents[0],
        intents,
        location_name: locationName.trim() || null,
        link: link.trim() || null,
        activity_date: hasDate
          ? activityDate.toISOString().split("T")[0]
          : null,
        photo_url: photo.url,
        photo_source: photo.source,
        photo_attribution: photo.attribution,
      };
      const { data, error } = await supabase
        .from("activities")
        .insert(insert)
        .select()
        .single();
      if (error) throw error;

      if (isFirst) {
        await supabase
          .from("profiles")
          .update({ has_seen_public_safety: true })
          .eq("id", user.id);
        await refreshProfile();
      }

      track("activity_created", {
        activity_id: data.id,
        category,
        intents,
        intent_count: intents.length,
        has_location: !!locationName,
        has_date: hasDate,
        has_link: !!link.trim(),
        char_count_title: title.trim().length,
        photo_source: photo.source,
      });
      track("public_confirm_accepted", {
        activity_id: data.id,
        is_first_activity: isFirst,
      });

      // Reset form
      setTitle("");
      setDescription("");
      setCategory(null);
      setIntents(["friends"]);
      setLocationName("");
      setLink("");
      setHasDate(false);
      setPhoto({ url: null, source: null, attribution: null, uploadPath: null });
      setSafetyModal("none");
      Alert.alert("Posted!", "Your activity is now in Discover.", [
        { text: "OK", onPress: () => navigation.navigate("Discover") },
      ]);
      fetchActiveCount();
    } catch (e: any) {
      Alert.alert("Couldn't post activity", e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const limitReached =
    activeCount !== null && activeCount >= MAX_ACTIVE_ACTIVITIES;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Post an activity</Text>
          {activeCount !== null && (
            <Text style={styles.headerCount}>
              {activeCount}/{MAX_ACTIVE_ACTIVITIES} active
            </Text>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <View style={styles.field}>
            <Text style={styles.label}>What do you wanna do?</Text>
            <TextInput
              value={title}
              onChangeText={(t) => {
                setTitle(t);
                if (errors.title) setErrors({ ...errors, title: "" });
              }}
              placeholder="Sunset hike at Griffith"
              placeholderTextColor={colors.neutral.slate}
              style={[styles.titleInput, errors.title && styles.inputError]}
              maxLength={TITLE_MAX}
            />
            <View style={styles.helperRow}>
              {errors.title ? (
                <Text style={styles.errorText}>{errors.title}</Text>
              ) : (
                <Text style={styles.helperText}>Make it specific</Text>
              )}
              <Text style={styles.charCount}>
                {title.length}/{TITLE_MAX}
              </Text>
            </View>
          </View>

          {/* Category — per-category accent color (middle gradient stop) */}
          <View style={styles.field}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {ACTIVITY_CATEGORIES.map((c) => {
                // Use the middle (signature) stop of the category's gradient
                // as the chip accent. Falls back to brand purple if missing.
                const accent =
                  (categoryGradients[c] && categoryGradients[c][1]) ??
                  colors.primary.wannaPurple;
                return (
                  <Chip
                    key={c}
                    label={`${CATEGORY_EMOJI[c]} ${c}`}
                    selected={category === c}
                    accentColor={accent}
                    onPress={() => {
                      setCategory(c);
                      if (errors.category)
                        setErrors({ ...errors, category: "" });
                    }}
                  />
                );
              })}
            </View>
            {errors.category ? (
              <Text style={styles.errorText}>{errors.category}</Text>
            ) : null}
          </View>

          {/* Intent — multi-select. Pick one or more (E3) */}
          <View style={styles.field}>
            <Text style={styles.label}>I'm looking for...</Text>
            <Text style={styles.helperText}>
              Pick one or more — your activity will show up under each mode you
              select.
            </Text>
            <View style={[styles.chipRow, { marginTop: spacing.xs }]}>
              {(["friends", "dating", "networking"] as Intent[]).map((opt) => {
                const selected = intents.includes(opt);
                const label =
                  opt === "friends"
                    ? "Friends"
                    : opt === "dating"
                    ? "Dating"
                    : "Networking";
                return (
                  <Chip
                    key={opt}
                    label={label}
                    selected={selected}
                    onPress={() => {
                      // Toggle but always keep at least one selected
                      if (selected) {
                        if (intents.length > 1) {
                          setIntents(intents.filter((i) => i !== opt));
                        }
                      } else {
                        setIntents([...intents, opt]);
                      }
                    }}
                  />
                );
              })}
            </View>
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>Details (optional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="When, where, what to bring, vibe."
              placeholderTextColor={colors.neutral.slate}
              style={[
                styles.textArea,
                errors.description && styles.inputError,
              ]}
              multiline
              maxLength={DESCRIPTION_MAX}
              textAlignVertical="top"
            />
            <View style={styles.helperRow}>
              <Text style={styles.helperText}>
                {errors.description || ""}
              </Text>
              <Text style={styles.charCount}>
                {description.length}/{DESCRIPTION_MAX}
              </Text>
            </View>
          </View>

          {/* Link (separate from details) */}
          <View style={styles.field}>
            <Text style={styles.label}>Link (optional)</Text>
            <TextInput
              value={link}
              onChangeText={(t) => {
                setLink(t);
                if (errors.link) setErrors({ ...errors, link: "" });
              }}
              placeholder="https://yelp.com/... · ticketmaster · eventbrite"
              placeholderTextColor={colors.neutral.slate}
              style={[styles.input, errors.link && styles.inputError]}
              maxLength={LINK_MAX}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {errors.link ? (
              <Text style={styles.errorText}>{errors.link}</Text>
            ) : null}
          </View>

          {/* Location */}
          <View style={styles.field}>
            <Text style={styles.label}>Location (optional)</Text>
            <TextInput
              value={locationName}
              onChangeText={setLocationName}
              placeholder="Griffith Observatory, LA"
              placeholderTextColor={colors.neutral.slate}
              style={[styles.input, errors.locationName && styles.inputError]}
              maxLength={LOCATION_NAME_MAX}
            />
          </View>

          {/* Date */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Specific date?</Text>
              <Switch
                value={hasDate}
                onValueChange={setHasDate}
                trackColor={{
                  false: colors.neutral.cloud,
                  true: colors.primary.softViolet,
                }}
                thumbColor={
                  hasDate ? colors.primary.wannaPurple : colors.neutral.white
                }
              />
            </View>
            {hasDate ? (
              <View style={styles.datePickerWrapper}>
                <DateTimePicker
                  value={activityDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "compact" : "default"}
                  minimumDate={new Date()}
                  onChange={(_, d) => d && setActivityDate(d)}
                />
              </View>
            ) : (
              <Text style={styles.helperText}>
                Leave off to make this evergreen — stays in Discover until you
                delete it.
              </Text>
            )}
            {errors.activityDate ? (
              <Text style={styles.errorText}>{errors.activityDate}</Text>
            ) : null}
          </View>

          {/* Photo (required) — comes AFTER the optional link so the link can
              auto-populate the photo when the user pastes one. */}
          {user && profile && (
            <View style={styles.field}>
              <PhotoStep
                link={link}
                searchSeed={title || category || ""}
                userId={user.id}
                isSeed={profile.is_seed}
                value={photo}
                onChange={(next) => {
                  setPhoto(next);
                  if (errors.photo) setErrors({ ...errors, photo: "" });
                }}
                errorText={errors.photo}
              />
            </View>
          )}

          <View style={{ height: spacing.xl }} />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={limitReached ? "Limit reached (5/5)" : "Post activity"}
            variant="gradient"
            onPress={handleSubmit}
            disabled={limitReached || submitting}
            loading={submitting}
          />
        </View>
      </KeyboardAvoidingView>

      {/* First-activity educational popup */}
      <Modal
        visible={safetyModal === "educational"}
        title="Stay safe — meet in public"
        body="All activities on Wanna should take place in public spaces like restaurants, parks, cafes, and venues. This keeps everyone safe. Never share your home address or agree to meet in a private location with someone you haven't met."
      >
        <Button
          label="Got it"
          variant="gradient"
          onPress={() => publishActivity(true)}
          loading={submitting}
        />
      </Modal>

      {/* Subsequent activity confirmation popup */}
      <Modal
        visible={safetyModal === "confirmation"}
        title="Is this activity in a public place?"
        body="For everyone's safety, all Wanna activities must happen in public spaces."
      >
        <Button
          label="Yes, it's public"
          variant="gradient"
          onPress={() => publishActivity(false)}
          loading={submitting}
        />
        <View style={{ height: spacing.sm }} />
        <Button
          label="Edit Activity"
          variant="outline"
          onPress={() => {
            track("public_confirm_edit");
            setSafetyModal("none");
          }}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
  },
  headerCount: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
  },
  scroll: {
    padding: spacing.lg,
  },
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: "600",
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  titleInput: {
    fontSize: fontSizes.heading,
    fontWeight: "700",
    color: colors.neutral.charcoal,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.neutral.cloud,
  },
  input: {
    height: 52,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  textArea: {
    minHeight: 120,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputError: {
    borderColor: "#E53E3E",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  helperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  helperText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
  },
  charCount: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
  },
  errorText: {
    fontSize: fontSizes.caption,
    color: "#E53E3E",
    marginTop: spacing.xs,
  },
  linkText: {
    fontSize: fontSizes.caption,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
  },
  datePickerWrapper: {
    alignItems: "flex-start",
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.cloud,
  },
});
