import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { Button } from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

const FREQUENCY_LABEL: Record<string, string> = {
  never: "Never",
  rarely: "Rarely",
  sometimes: "Sometimes",
  often: "Often",
};

const POLITICAL_LABEL: Record<string, string> = {
  liberal: "Liberal",
  moderate: "Moderate",
  conservative: "Conservative",
};

export function ProfileScreen({ navigation }: { navigation: any }) {
  const { profile, refreshProfile } = useAuth();
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    if (!profile) return;
    Promise.all(profile.photos.map(resolveProfilePhotoUrl)).then(setPhotoUrls);
  }, [profile?.photos]);

  useFocusEffect(
    React.useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.empty}>Loading profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const age = profile.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(profile.date_of_birth).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable onPress={() => navigation.navigate("Settings")}>
          <Text style={styles.headerAction}>⚙</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero photo */}
        <View style={styles.heroWrapper}>
          {photoUrls[0] ? (
            <Image source={{ uri: photoUrls[0] }} style={styles.heroPhoto} />
          ) : (
            <LinearGradient
              colors={[colors.primary.softViolet, colors.secondary.wannaCyan]}
              style={styles.heroPhoto}
            />
          )}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            locations={[0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <View style={styles.nameRow}>
              <Text style={styles.heroName}>
                {profile.first_name}
                {age !== null ? `, ${age}` : ""}
              </Text>
              {profile.is_verified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedCheck}>✓</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable
            style={styles.editFab}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <Text style={styles.editFabIcon}>✏️</Text>
          </Pressable>
        </View>

        {/* Verification CTA */}
        {!profile.is_verified && (
          <Pressable
            style={styles.verifyCard}
            onPress={() => navigation.navigate("Verification")}
          >
            <View style={styles.verifyIcon}>
              <Text style={styles.verifyCheck}>✓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyTitle}>Get verified</Text>
              <Text style={styles.verifySubtitle}>
                Verified profiles are more likely to get matches.
              </Text>
            </View>
            <Text style={styles.verifyChevron}>›</Text>
          </Pressable>
        )}

        {/* Bio */}
        {profile.bio ? (
          <Section title="About">
            <Text style={styles.bodyText}>{profile.bio}</Text>
          </Section>
        ) : null}

        {/* Activity preferences */}
        <Section title="Into">
          <View style={styles.chipsRow}>
            {profile.activity_preferences.map((p) => (
              <View key={p} style={styles.chip}>
                <Text style={styles.chipText}>{p}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* Optional details */}
        <Section title="Details">
          {profile.profession ? (
            <DetailRow icon="💼" label={profile.profession} />
          ) : null}
          {profile.university ? (
            <DetailRow icon="🎓" label={profile.university} />
          ) : null}
          {profile.political_orientation ? (
            <DetailRow
              icon="🗳️"
              label={POLITICAL_LABEL[profile.political_orientation]}
            />
          ) : null}
          {profile.alcohol ? (
            <DetailRow
              icon="🍸"
              label={`${FREQUENCY_LABEL[profile.alcohol]} alcohol`}
            />
          ) : null}
          {profile.marijuana ? (
            <DetailRow
              icon="🌿"
              label={`${FREQUENCY_LABEL[profile.marijuana]} 420`}
            />
          ) : null}
          {profile.star_sign ? (
            <DetailRow icon="✨" label={profile.star_sign} />
          ) : null}
          {!profile.profession &&
            !profile.university &&
            !profile.political_orientation &&
            !profile.alcohol &&
            !profile.marijuana &&
            !profile.star_sign && (
              <Text style={styles.emptyDetailText}>
                Add optional details to help others get to know you.
              </Text>
            )}
        </Section>

        {/* Photo grid */}
        <Section title={`Photos (${profile.photos.length}/6)`}>
          <View style={styles.photoGrid}>
            {photoUrls.map((url, i) =>
              url ? (
                <Image key={i} source={{ uri: url }} style={styles.gridPhoto} />
              ) : (
                <View key={i} style={[styles.gridPhoto, styles.gridPhotoEmpty]}>
                  <Text style={styles.gridPhotoEmptyIcon}>+</Text>
                </View>
              )
            )}
          </View>
        </Section>

        {/* Quick actions */}
        <View style={styles.actions}>
          <Button
            label="Edit profile"
            variant="gradient"
            onPress={() => navigation.navigate("EditProfile")}
          />
          <Button
            label="Discovery preferences"
            variant="outline"
            onPress={() => navigation.navigate("DiscoveryPreferences")}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
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

function DetailRow({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailIcon}>{icon}</Text>
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.neutral.slate },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
  },
  headerAction: {
    fontSize: 28,
    color: colors.neutral.charcoal,
  },
  scroll: {
    paddingBottom: spacing.xl,
  },
  heroWrapper: {
    height: 360,
    position: "relative",
  },
  heroPhoto: {
    width: "100%",
    height: "100%",
  },
  heroContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  heroName: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: colors.neutral.white,
  },
  verifiedBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedCheck: {
    color: colors.neutral.white,
    fontSize: 16,
    fontWeight: "800",
  },
  editFab: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  editFabIcon: {
    fontSize: 18,
  },
  verifyCard: {
    flexDirection: "row",
    alignItems: "center",
    margin: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.primary.lavenderMist,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  verifyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyCheck: {
    color: colors.neutral.white,
    fontSize: 22,
    fontWeight: "800",
  },
  verifyTitle: {
    fontSize: fontSizes.body,
    fontWeight: "700",
    color: colors.primary.royalPurple,
  },
  verifySubtitle: {
    fontSize: fontSizes.caption,
    color: colors.primary.deepViolet,
    marginTop: 2,
  },
  verifyChevron: {
    fontSize: 24,
    color: colors.primary.deepViolet,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  bodyText: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    lineHeight: 24,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary.lavenderMist,
    borderRadius: borderRadius.full,
  },
  chipText: {
    fontSize: fontSizes.caption,
    color: colors.primary.royalPurple,
    fontWeight: "700",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  detailIcon: {
    fontSize: fontSizes.body,
    width: 24,
  },
  detailLabel: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  emptyDetailText: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    fontStyle: "italic",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  gridPhoto: {
    width: "31%",
    aspectRatio: 4 / 5,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral.cloud,
  },
  gridPhotoEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  gridPhotoEmptyIcon: {
    fontSize: 32,
    color: colors.neutral.slate,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
});
