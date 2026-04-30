import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { track } from "../../lib/analytics";
import {
  INTENTS,
  SHOW_ME_OPTIONS,
  type Intent,
  type ShowMe,
} from "../../constants/enums";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

const DISTANCE_PRESETS = [10, 25, 50, 100];

interface DiscoveryRow {
  user_id: string;
  modes: Intent[];
  show_me: ShowMe;
  age_min: number;
  age_max: number;
  max_distance_miles: number;
}

export function DiscoveryPreferencesScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const [modes, setModes] = useState<Intent[]>(["friends"]);
  const [showMe, setShowMe] = useState<ShowMe>("everyone");
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("99");
  const [maxDistance, setMaxDistance] = useState(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("discovery_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const row = data as DiscoveryRow;
          setModes(row.modes);
          setShowMe(row.show_me);
          setAgeMin(String(row.age_min));
          setAgeMax(String(row.age_max));
          setMaxDistance(row.max_distance_miles);
        }
        setLoading(false);
      });
  }, [user]);

  const toggleMode = (m: Intent) => {
    setModes((prev) => {
      if (prev.includes(m)) {
        if (prev.length === 1) return prev; // require at least 1
        return prev.filter((x) => x !== m);
      }
      return [...prev, m];
    });
  };

  const handleSave = async () => {
    if (!user) return;
    const minN = parseInt(ageMin, 10);
    const maxN = parseInt(ageMax, 10);
    if (
      isNaN(minN) ||
      isNaN(maxN) ||
      minN < 18 ||
      maxN > 99 ||
      minN > maxN
    ) {
      Alert.alert("Invalid age range", "Min ≥ 18, max ≤ 99, and min ≤ max.");
      return;
    }
    setSaving(true);
    const updates = {
      modes,
      show_me: showMe,
      age_min: minN,
      age_max: maxN,
      max_distance_miles: maxDistance,
    };
    const { error } = await supabase
      .from("discovery_preferences")
      .update(updates)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    track("discovery_prefs_changed", {
      fields_changed: Object.keys(updates),
    });
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Discovery</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Section
          title="I'm here for"
          subtitle="Pick what you want to see in your feed."
        >
          <View style={styles.chipsRow}>
            {INTENTS.map((m) => (
              <Chip
                key={m}
                label={m === "friends" ? "Friends" : m === "dating" ? "Dating" : "Networking"}
                selected={modes.includes(m)}
                onPress={() => toggleMode(m)}
              />
            ))}
          </View>
        </Section>

        <Section title="Show me" subtitle="Whose activities will I see?">
          <View style={styles.chipsRow}>
            {SHOW_ME_OPTIONS.map((s) => (
              <Chip
                key={s}
                label={s.charAt(0).toUpperCase() + s.slice(1)}
                selected={showMe === s}
                onPress={() => setShowMe(s)}
              />
            ))}
          </View>
        </Section>

        <Section title="Age range">
          <View style={styles.ageRow}>
            <View style={styles.ageInputWrapper}>
              <Text style={styles.ageLabel}>Min</Text>
              <TextInput
                value={ageMin}
                onChangeText={setAgeMin}
                keyboardType="number-pad"
                style={styles.ageInput}
                maxLength={2}
              />
            </View>
            <Text style={styles.ageSeparator}>to</Text>
            <View style={styles.ageInputWrapper}>
              <Text style={styles.ageLabel}>Max</Text>
              <TextInput
                value={ageMax}
                onChangeText={setAgeMax}
                keyboardType="number-pad"
                style={styles.ageInput}
                maxLength={2}
              />
            </View>
          </View>
        </Section>

        <Section title="Max distance">
          <View style={styles.chipsRow}>
            {DISTANCE_PRESETS.map((d) => (
              <Chip
                key={d}
                label={`${d} mi`}
                selected={maxDistance === d}
                onPress={() => setMaxDistance(d)}
              />
            ))}
          </View>
        </Section>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={saving ? "Saving…" : "Save"}
          variant="gradient"
          onPress={handleSave}
          loading={saving}
        />
      </View>
    </SafeAreaView>
  );
}

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
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.white },
  loadingText: {
    textAlign: "center",
    marginTop: spacing.xl,
    color: colors.neutral.slate,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  backText: {
    fontSize: fontSizes.body,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
    width: 60,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.charcoal,
  },
  scroll: { padding: spacing.lg },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: fontSizes.body,
    fontWeight: "700",
    color: colors.neutral.charcoal,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  ageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
  },
  ageInputWrapper: { flex: 1 },
  ageLabel: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginBottom: spacing.xs,
  },
  ageInput: {
    height: 52,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    textAlign: "center",
  },
  ageSeparator: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    marginBottom: spacing.md,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.cloud,
  },
});
