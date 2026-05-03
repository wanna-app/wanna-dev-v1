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
import { Icon, IconName } from "../../components/Icon";
import { useAuth } from "../../hooks/useAuth";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import {
  categoryGradients,
  colors,
  spacing,
  borderRadius,
  fontSizes,
  fonts,
  shadows,
} from "../../theme";
import type { ActivityCategory } from "../../constants/categories";

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

// Maps the user's activity_preferences to the same colored interest pills
// the mockup uses on the Profile screen. Color is the middle (signature)
// stop of each category's gradient.
function pillColor(label: string): string {
  // Match by partial / case-insensitive prefix so 'Music' picks up
  // 'Music & Concerts' from categoryGradients.
  const found = Object.keys(categoryGradients).find((key) =>
    key.toLowerCase().startsWith(label.toLowerCase())
  ) as ActivityCategory | undefined;
  if (found) return categoryGradients[found][1];
  return colors.primary.wannaPurple;
}

const INTEREST_ICON: Record<string, IconName> = {
  Music: "MusicNotes",
  Outdoors: "Mountains",
  Fitness: "TennisBall",
  Food: "ForkKnife",
  Arts: "Palette",
  Bars: "Martini",
  Books: "BookOpen",
  Movies: "FilmStrip",
  Gaming: "GameController",
  Other: "Sparkle",
};

function interestIcon(label: string): IconName {
  // Match by first word
  const first = label.split(" ")[0];
  return INTEREST_ICON[first] ?? "Sparkle";
}

export function ProfileScreen({ navigation }: { navigation: any }) {
  const { profile, refreshProfile, signOut } = useAuth();
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

  const optionalFields = [
    profile.political_orientation && {
      icon: "Scales" as IconName,
      label: "Politics",
      value: POLITICAL_LABEL[profile.political_orientation],
    },
    profile.star_sign && {
      icon: "Star" as IconName,
      label: "Star sign",
      value: profile.star_sign,
    },
    profile.alcohol && {
      icon: "BeerBottle" as IconName,
      label: "Drinks",
      value: FREQUENCY_LABEL[profile.alcohol],
    },
    profile.marijuana && {
      icon: "Leaf" as IconName,
      label: "420",
      value: FREQUENCY_LABEL[profile.marijuana],
    },
  ].filter(Boolean) as Array<{ icon: IconName; label: string; value: string }>;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* HERO PHOTO — full bleed with name overlay */}
        <View style={styles.heroWrapper}>
          {photoUrls[0] ? (
            <Image source={{ uri: photoUrls[0] }} style={styles.heroPhoto} />
          ) : (
            <LinearGradient
              colors={[colors.primary.softViolet, colors.secondary.wannaCyan]}
              style={styles.heroPhoto}
            />
          )}
          {/* Top scrim — keeps the chrome buttons legible */}
          <LinearGradient
            colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]}
            locations={[0, 0.5]}
            style={[StyleSheet.absoluteFill, { height: 180 }]}
            pointerEvents="none"
          />
          {/* Bottom scrim — keeps the name block legible */}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]}
            locations={[0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Top chrome — Edit + Settings */}
          <SafeAreaView edges={["top"]} style={styles.topChromeSafe}>
            <Pressable
              style={styles.editPill}
              onPress={() => navigation.navigate("EditProfile")}
              hitSlop={6}
            >
              <Icon
                name="PencilSimple"
                size={14}
                color={colors.neutral.charcoal}
                weight="bold"
              />
              <Text style={styles.editPillText}>Edit profile</Text>
            </Pressable>
            <Pressable
              style={styles.chromeBtn}
              onPress={() => navigation.navigate("Settings")}
              hitSlop={6}
            >
              <Icon
                name="GearSix"
                size={18}
                color={colors.neutral.charcoal}
                weight="bold"
              />
            </Pressable>
          </SafeAreaView>

          {/* Photo dots — multi-photo indicator */}
          {photoUrls.length > 1 && (
            <View style={styles.photoDots}>
              {photoUrls.map((_, i) => (
                <View
                  key={i}
                  style={[styles.photoDot, i === 0 && styles.photoDotActive]}
                />
              ))}
            </View>
          )}

          {/* Name block over photo */}
          <View style={styles.nameOverlay}>
            <View style={styles.nameRow}>
              <Text style={styles.heroName}>
                {profile.first_name}
                {age !== null ? `, ${age}` : ""}
              </Text>
              {profile.is_verified && (
                <Icon
                  name="SealCheck"
                  size={26}
                  color="#FFFFFF"
                  weight="fill"
                />
              )}
            </View>
            <View style={styles.subtitleRow}>
              {/* Pronouns aren't on the schema yet — show location only */}
              {(profile.location_lat !== null && profile.location_lng !== null) ? (
                <View style={styles.subtitleItem}>
                  <Icon name="MapPin" size={13} color="#FFFFFF" weight="bold" />
                  <Text style={styles.subtitleText}>Nearby</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ABOUT — bio + profession + university */}
        {(profile.bio || profile.profession || profile.university) && (
          <Section title="About">
            <View style={styles.aboutCard}>
              {profile.bio ? (
                <Text style={styles.bioText}>{profile.bio}</Text>
              ) : null}
              {(profile.profession || profile.university) && (
                <View
                  style={[
                    styles.aboutDetails,
                    profile.bio ? styles.aboutDetailsWithBorder : undefined,
                  ]}
                >
                  {profile.profession ? (
                    <InfoLine iconName="Briefcase" label={profile.profession} />
                  ) : null}
                  {profile.university ? (
                    <InfoLine
                      iconName="GraduationCap"
                      label={profile.university}
                    />
                  ) : null}
                </View>
              )}
            </View>
          </Section>
        )}

        {/* INTERESTS — colored pills, one per activity preference */}
        {profile.activity_preferences.length > 0 && (
          <Section title="Interests">
            <View style={styles.pillsRow}>
              {profile.activity_preferences.map((label) => {
                // Each chip uses the category's signature middle gradient
                // stop as its background color.
                const bg = pillColor(label);
                const iconName = interestIcon(label);
                return (
                  <View
                    key={label}
                    style={[styles.interestPill, { backgroundColor: bg }]}
                  >
                    <Icon name={iconName} size={14} color="#FFFFFF" weight="bold" />
                    <Text style={styles.interestPillText}>{label}</Text>
                  </View>
                );
              })}
            </View>
          </Section>
        )}

        {/* A BIT MORE — 2x2 fact tile grid (politics / star sign / drinks / 420) */}
        {optionalFields.length > 0 && (
          <Section title="A bit more">
            <View style={styles.factGrid}>
              {optionalFields.map((f) => (
                <FactTile
                  key={f.label}
                  iconName={f.icon}
                  label={f.label}
                  value={f.value}
                />
              ))}
            </View>
          </Section>
        )}

        {/* WHO I WANT TO MEET — discovery preferences (read-only summary) */}
        <Section title="Who I want to meet" subtitle="Only you see this">
          <View style={styles.rowList}>
            <PrefRow
              iconName="Sparkle"
              label="Mode"
              value="Tap to edit"
              onPress={() => navigation.navigate("DiscoveryPreferences")}
            />
            <PrefRow
              iconName="User"
              label="Show me"
              value="Tap to edit"
              onPress={() => navigation.navigate("DiscoveryPreferences")}
            />
            <PrefRow
              iconName="Cake"
              label="Age"
              value="Tap to edit"
              onPress={() => navigation.navigate("DiscoveryPreferences")}
            />
            <PrefRow
              iconName="MapPin"
              label="Distance"
              value="Tap to edit"
              onPress={() => navigation.navigate("DiscoveryPreferences")}
              last
            />
          </View>
        </Section>

        {/* SETTINGS — quick links */}
        <Section title="Settings">
          <View style={styles.rowList}>
            <SettingsRow
              iconName="ShieldCheck"
              label="Verification"
              badge={profile.is_verified ? "Verified" : "Not yet"}
              badgeTone={profile.is_verified ? "success" : "neutral"}
              onPress={() =>
                profile.is_verified
                  ? undefined
                  : navigation.navigate("Verification")
              }
            />
            <SettingsRow
              iconName="Bell"
              label="Notifications"
              onPress={() => navigation.navigate("Settings")}
            />
            <SettingsRow
              iconName="Prohibit"
              label="Blocked users"
              onPress={() => navigation.navigate("BlockList")}
            />
            <SettingsRow
              iconName="Lifebuoy"
              label="Help & Safety"
              onPress={() => navigation.navigate("Settings")}
            />
            <SettingsRow
              iconName="SignOut"
              label="Sign out"
              tone="danger"
              onPress={signOut}
              last
            />
          </View>
        </Section>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Local helpers ───────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function InfoLine({ iconName, label }: { iconName: IconName; label: string }) {
  return (
    <View style={styles.infoLine}>
      <View style={styles.infoLineIcon}>
        <Icon name={iconName} size={16} color={colors.primary.wannaPurple} weight="bold" />
      </View>
      <Text style={styles.infoLineLabel}>{label}</Text>
    </View>
  );
}

function FactTile({
  iconName,
  label,
  value,
}: {
  iconName: IconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.factTile}>
      <View style={styles.factHeader}>
        <Icon
          name={iconName}
          size={12}
          color={colors.primary.wannaPurple}
          weight="bold"
        />
        <Text style={styles.factLabel}>{label.toUpperCase()}</Text>
      </View>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function PrefRow({
  iconName,
  label,
  value,
  onPress,
  last,
}: {
  iconName: IconName;
  label: string;
  value: string;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.prefRow, !last && styles.rowDivider]}
    >
      <View style={styles.prefIconBox}>
        <Icon
          name={iconName}
          size={16}
          color={colors.primary.wannaPurple}
          weight="bold"
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.prefLabel}>{label.toUpperCase()}</Text>
        <Text style={styles.prefValue}>{value}</Text>
      </View>
      <Icon
        name="CaretRight"
        size={14}
        color={colors.neutral.slate}
        weight="bold"
      />
    </Pressable>
  );
}

function SettingsRow({
  iconName,
  label,
  badge,
  badgeTone = "neutral",
  tone = "default",
  onPress,
  last,
}: {
  iconName: IconName;
  label: string;
  badge?: string;
  badgeTone?: "success" | "warn" | "neutral";
  tone?: "default" | "danger";
  onPress?: () => void;
  last?: boolean;
}) {
  const labelColor = tone === "danger" ? colors.state.danger : colors.neutral.charcoal;
  const iconColor = tone === "danger" ? colors.state.danger : colors.primary.wannaPurple;
  const badgeBg =
    badgeTone === "success"
      ? "rgba(52,199,122,0.15)"
      : badgeTone === "warn"
      ? "rgba(255,179,71,0.18)"
      : "rgba(140,82,255,0.12)";
  const badgeFg =
    badgeTone === "success"
      ? colors.state.success
      : badgeTone === "warn"
      ? "#B07A1E"
      : colors.primary.wannaPurple;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.settingsRow, !last && styles.rowDivider]}
    >
      <View style={styles.settingsIconBox}>
        <Icon name={iconName} size={18} color={iconColor} weight="bold" />
      </View>
      <Text style={[styles.settingsLabel, { color: labelColor }]}>{label}</Text>
      {badge ? (
        <View style={[styles.settingsBadge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.settingsBadgeText, { color: badgeFg }]}>
            {badge}
          </Text>
        </View>
      ) : null}
      <Icon
        name="CaretRight"
        size={14}
        color={colors.neutral.slate}
        weight="bold"
      />
    </Pressable>
  );
}

const HERO_HEIGHT = 460;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.subtle },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.neutral.slate },
  scroll: { paddingBottom: spacing.lg },

  // HERO
  heroWrapper: {
    height: HERO_HEIGHT,
    width: "100%",
    position: "relative",
    backgroundColor: colors.primary.deepViolet,
  },
  heroPhoto: { width: "100%", height: "100%" },
  topChromeSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    zIndex: 5,
  },
  editPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.92)",
    ...shadows.sm,
  },
  editPillText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  chromeBtn: {
    width: 38,
    height: 38,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  photoDots: {
    position: "absolute",
    top: 102,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    gap: 4,
    zIndex: 4,
  },
  photoDot: {
    flex: 1,
    height: 3,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  photoDotActive: { backgroundColor: "#FFFFFF" },
  nameOverlay: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 22,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  heroName: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 32,
    letterSpacing: -0.6,
    lineHeight: 34,
    color: "#FFFFFF",
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  subtitleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  subtitleText: {
    fontFamily: fonts.heading,
    fontWeight: "600",
    fontSize: 13,
    color: "rgba(255,255,255,0.95)",
  },

  // SECTION
  section: {
    paddingHorizontal: spacing.md,
    paddingTop: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    color: colors.fg.secondary,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  sectionSubtitle: {
    fontSize: 11,
    color: colors.neutral.slate,
    fontStyle: "italic",
  },

  // ABOUT
  aboutCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    ...shadows.sm,
  },
  bioText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.neutral.charcoal,
  },
  aboutDetails: {
    gap: 8,
    marginTop: 14,
  },
  aboutDetailsWithBorder: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  infoLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoLineIcon: { width: 18 },
  infoLineLabel: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 13.5,
    color: colors.neutral.charcoal,
  },

  // INTERESTS — colored pills
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  interestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9999,
    ...shadows.sm,
  },
  interestPillText: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 12,
  },

  // A BIT MORE — 2x2 fact tiles
  factGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  factTile: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    gap: 4,
    ...shadows.sm,
  },
  factHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  factLabel: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 10.5,
    letterSpacing: 0.9,
    color: colors.fg.secondary,
  },
  factValue: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 15,
    color: colors.neutral.charcoal,
    marginTop: 2,
  },

  // ROW LIST (prefs + settings)
  rowList: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 4,
    ...shadows.sm,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  prefIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(140,82,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  prefLabel: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.7,
    color: colors.fg.secondary,
  },
  prefValue: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 14,
    color: colors.neutral.charcoal,
    marginTop: 2,
  },

  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  settingsIconBox: {
    width: 22,
    alignItems: "center",
  },
  settingsLabel: {
    flex: 1,
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 14.5,
  },
  settingsBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  settingsBadgeText: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
  },
});
