import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, IconName } from "../../components/Icon";
import { ReportSheet } from "../../components/ReportSheet";
import { Chip } from "../../components/Chip";
import { supabase } from "../../lib/supabase";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import type { Profile } from "../../types/database";
import {
  colors,
  spacing,
  borderRadius,
  fontSizes,
  fonts,
} from "../../theme";

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

interface RouteParams {
  userId: string;
}

/**
 * Read-only view of another user's profile. Reached by tapping the host
 * pill on a Discover card, the "Posted by" card on Activity Detail, or
 * an interested person card on Who's In.
 *
 * Mirrors the layout of the user's own ProfileScreen but with edit
 * affordances removed and a Report link added.
 */
export function UserProfileScreen({ navigation, route }: any) {
  const { userId } = route.params as RouteParams;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(data as Profile);
      const urls = await Promise.all(
        (data.photos as string[]).map(resolveProfilePhotoUrl)
      );
      if (!cancelled) {
        setPhotoUrls(urls);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary.wannaPurple} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.empty}>Profile not found.</Text>
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
      <View style={styles.topChrome}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.chromeBtn}
          hitSlop={8}
        >
          <Icon
            name="CaretLeft"
            size={20}
            color={colors.neutral.charcoal}
            weight="bold"
          />
        </Pressable>
        <Pressable
          onPress={() => setReportOpen(true)}
          style={styles.chromeBtn}
          hitSlop={8}
        >
          <Icon
            name="DotsThree"
            size={20}
            color={colors.neutral.charcoal}
            weight="bold"
          />
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
            pointerEvents="none"
          />
          <View style={styles.heroContent}>
            <View style={styles.nameRow}>
              <Text style={styles.heroName}>
                {profile.first_name}
                {age !== null ? `, ${age}` : ""}
              </Text>
              {profile.is_verified && (
                <Icon
                  name="SealCheck"
                  size={20}
                  color="#FFFFFF"
                  weight="fill"
                />
              )}
            </View>
          </View>
        </View>

        {/* Bio */}
        {profile.bio ? (
          <Section title="About">
            <Text style={styles.bodyText}>{profile.bio}</Text>
          </Section>
        ) : null}

        {/* Activity preferences */}
        {profile.activity_preferences.length > 0 && (
          <Section title="Into">
            <View style={styles.chipsRow}>
              {profile.activity_preferences.map((p) => (
                <Chip key={p} label={p} />
              ))}
            </View>
          </Section>
        )}

        {/* Photos beyond the hero */}
        {photoUrls.length > 1 && (
          <Section title="Photos">
            <View style={styles.photoGrid}>
              {photoUrls.slice(1).map((url, idx) =>
                url ? (
                  <Image
                    key={idx}
                    source={{ uri: url }}
                    style={styles.photoTile}
                  />
                ) : null
              )}
            </View>
          </Section>
        )}

        {/* Lifestyle details */}
        {(profile.profession ||
          profile.university ||
          profile.political_orientation ||
          profile.alcohol ||
          profile.marijuana ||
          profile.star_sign) && (
          <Section title="Details">
            {profile.profession ? (
              <DetailRow iconName="Briefcase" label={profile.profession} />
            ) : null}
            {profile.university ? (
              <DetailRow iconName="GraduationCap" label={profile.university} />
            ) : null}
            {profile.political_orientation ? (
              <DetailRow
                iconName="Gavel"
                label={POLITICAL_LABEL[profile.political_orientation]}
              />
            ) : null}
            {profile.alcohol ? (
              <DetailRow
                iconName="Wine"
                label={`${FREQUENCY_LABEL[profile.alcohol]} alcohol`}
              />
            ) : null}
            {profile.marijuana ? (
              <DetailRow
                iconName="Leaf"
                label={`${FREQUENCY_LABEL[profile.marijuana]} marijuana`}
              />
            ) : null}
            {profile.star_sign ? (
              <DetailRow iconName="Star" label={profile.star_sign} />
            ) : null}
          </Section>
        )}

        {/* Report link */}
        <Pressable
          onPress={() => setReportOpen(true)}
          style={styles.reportLink}
          hitSlop={6}
        >
          <Text style={styles.reportLinkText}>⚠️ Report this user</Text>
        </Pressable>
      </ScrollView>

      <ReportSheet
        visible={reportOpen}
        reportedUserId={profile.id}
        reportedUserName={profile.first_name}
        reportedContentType="profile"
        source="user_profile"
        onClose={() => setReportOpen(false)}
      />
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

function DetailRow({ iconName, label }: { iconName: IconName; label: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Icon
          name={iconName}
          size={18}
          color={colors.primary.wannaPurple}
          weight="bold"
        />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.neutral.slate },

  topChrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  chromeBtn: {
    width: 38,
    height: 38,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: { paddingBottom: spacing.xxl },

  heroWrapper: {
    height: 460,
    width: "100%",
    position: "relative",
  },
  heroPhoto: { width: "100%", height: "100%" },
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
    fontSize: fontSizes.display,
    color: colors.neutral.white,
    fontWeight: "700",
  },

  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    fontSize: 11,
    color: colors.fg.secondary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  bodyText: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    lineHeight: 22,
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },

  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  photoTile: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral.cloud,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  detailIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },

  reportLink: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  reportLinkText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    fontWeight: "600",
  },
});
