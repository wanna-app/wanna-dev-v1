import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
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

const AGE_MIN_BOUND = 18;
const AGE_MAX_BOUND = 99;
const DISTANCE_MIN = 0;
const DISTANCE_MAX = 100;

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
  const [ageMin, setAgeMin] = useState<number>(AGE_MIN_BOUND);
  const [ageMax, setAgeMax] = useState<number>(AGE_MAX_BOUND);
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
          setAgeMin(row.age_min);
          setAgeMax(row.age_max);
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
    if (ageMin > ageMax) {
      Alert.alert("Invalid age range", "Min age must be ≤ max age.");
      return;
    }
    setSaving(true);
    const updates = {
      modes,
      show_me: showMe,
      age_min: ageMin,
      age_max: ageMax,
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
            <NumberStepper
              label="Min"
              value={ageMin}
              min={AGE_MIN_BOUND}
              max={ageMax}
              onChange={setAgeMin}
            />
            <Text style={styles.ageSeparator}>to</Text>
            <NumberStepper
              label="Max"
              value={ageMax}
              min={ageMin}
              max={AGE_MAX_BOUND}
              onChange={setAgeMax}
            />
          </View>
        </Section>

        <Section title="Max distance">
          <View style={styles.distanceHeader}>
            <Text style={styles.distanceValue}>
              {maxDistance === 0 ? "Anywhere" : `${maxDistance} mi`}
            </Text>
          </View>
          <Slider
            value={maxDistance}
            onValueChange={(v) => setMaxDistance(Math.round(v))}
            minimumValue={DISTANCE_MIN}
            maximumValue={DISTANCE_MAX}
            step={1}
            minimumTrackTintColor={colors.primary.wannaPurple}
            maximumTrackTintColor={colors.neutral.cloud}
            thumbTintColor={colors.primary.wannaPurple}
            style={styles.slider}
          />
          <View style={styles.sliderEnds}>
            <Text style={styles.sliderEndText}>0</Text>
            <Text style={styles.sliderEndText}>100 mi</Text>
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

/**
 * iOS-style number stepper. The user asked for a "number picker, not
 * text fields" — a -/+ stepper around a centered numeric value reads
 * cleanly and is fully native (no keyboard). Clamps to [min, max] so
 * the min/max ages can never cross over.
 */
function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <View style={styles.stepperWrap}>
      <Text style={styles.ageLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={dec}
          style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
          disabled={value <= min}
          hitSlop={8}
        >
          <Icon
            name="X"
            size={14}
            color={value <= min ? colors.neutral.slate : colors.primary.wannaPurple}
            weight="bold"
          />
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          onPress={inc}
          style={[styles.stepperBtn, value >= max && styles.stepperBtnDisabled]}
          disabled={value >= max}
          hitSlop={8}
        >
          <Icon
            name="Plus"
            size={14}
            color={value >= max ? colors.neutral.slate : colors.primary.wannaPurple}
            weight="bold"
          />
        </Pressable>
      </View>
    </View>
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
  ageLabel: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginBottom: spacing.xs,
  },
  ageSeparator: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    marginBottom: spacing.md,
  },
  // Number stepper (-/+ around a centered value)
  stepperWrap: { flex: 1 },
  stepperRow: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    backgroundColor: colors.neutral.white,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperValue: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 20,
    color: colors.neutral.charcoal,
  },
  // Distance slider
  distanceHeader: {
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  distanceValue: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 22,
    color: colors.primary.wannaPurple,
  },
  slider: {
    width: "100%",
    height: 36,
  },
  sliderEnds: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: -spacing.xs,
  },
  sliderEndText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.cloud,
  },
});
