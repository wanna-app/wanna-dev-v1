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
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { SimpleSlider } from "../../components/SimpleSlider";
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
// 1-mile floor — "0 mi" was confusing (would never match anything in
// practice). 1 mi is the smallest useful neighborhood radius.
const DISTANCE_MIN = 1;
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
  const [maxDistance, setMaxDistance] = useState(25);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Tracks which age dropdown (Min / Max) is currently expanded —
  // mutually exclusive so the screen never shows both popovers at
  // once.
  const [openDropdown, setOpenDropdown] = useState<"min" | "max" | null>(null);

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
          title="I wanna meet…"
          subtitle="Pick what you want to see in your feed."
        >
          <View style={styles.chipsRow}>
            {INTENTS.map((m) => {
              // Per-mode accent matches the swiper-mode badge on
              // Discover so Friends is purple, Dates pink, Networking
              // blue — consistent across the app.
              const accent =
                m === "friends"
                  ? "#8C52FF"
                  : m === "dating"
                  ? "#FF5C7A"
                  : "#1E90FF";
              const label =
                m === "friends"
                  ? "Friends"
                  : m === "dating"
                  ? "Dates"
                  : "Networking";
              return (
                <Chip
                  key={m}
                  label={label}
                  selected={modes.includes(m)}
                  accentColor={accent}
                  onPress={() => toggleMode(m)}
                  style={styles.bigChip}
                />
              );
            })}
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
                style={styles.bigChip}
              />
            ))}
          </View>
        </Section>

        <Section title="Age range">
          <View style={styles.ageRow}>
            <AgeDropdown
              label="Min"
              value={ageMin}
              min={AGE_MIN_BOUND}
              max={ageMax}
              onChange={setAgeMin}
              open={openDropdown === "min"}
              onToggle={() =>
                setOpenDropdown(openDropdown === "min" ? null : "min")
              }
            />
            <Text style={styles.ageSeparator}>to</Text>
            <AgeDropdown
              label="Max"
              value={ageMax}
              min={ageMin}
              max={AGE_MAX_BOUND}
              onChange={setAgeMax}
              open={openDropdown === "max"}
              onToggle={() =>
                setOpenDropdown(openDropdown === "max" ? null : "max")
              }
            />
          </View>
        </Section>

        <Section title="Max distance">
          <View style={styles.distanceHeader}>
            <Text style={styles.distanceValue}>{maxDistance} mi</Text>
          </View>
          <SimpleSlider
            value={maxDistance}
            min={DISTANCE_MIN}
            max={DISTANCE_MAX}
            step={1}
            onValueChange={setMaxDistance}
          />
          <View style={styles.sliderEnds}>
            <Text style={styles.sliderEndText}>1 mi</Text>
            <Text style={styles.sliderEndText}>100 mi</Text>
          </View>
        </Section>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={saving ? "Saving…" : "Save"}
          variant="primary"
          onPress={handleSave}
          loading={saving}
        />
      </View>
    </SafeAreaView>
  );
}

/**
 * Tap-to-expand dropdown for the Min/Max age. Renders the current
 * value in a pill, and on tap reveals a vertically scrolling list of
 * candidate ages (clamped to [min, max] so the two dropdowns can't
 * cross over). Picking a row collapses the dropdown.
 */
function AgeDropdown({
  label,
  value,
  min,
  max,
  onChange,
  open,
  onToggle,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const options = React.useMemo(() => {
    const out: number[] = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
  }, [min, max]);

  return (
    <View style={styles.dropdownWrap}>
      <Text style={styles.ageLabel}>{label}</Text>
      <Pressable style={styles.dropdownTrigger} onPress={onToggle}>
        <Text style={styles.dropdownValue}>{value}</Text>
        <Icon
          name="CaretDown"
          size={14}
          color={colors.primary.wannaPurple}
          weight="bold"
        />
      </Pressable>
      {open ? (
        <View style={styles.dropdownPanel}>
          <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
            {options.map((n) => {
              const selected = n === value;
              return (
                <Pressable
                  key={n}
                  style={[
                    styles.dropdownItem,
                    selected && styles.dropdownItemSelected,
                  ]}
                  onPress={() => {
                    onChange(n);
                    onToggle();
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      selected && styles.dropdownItemTextSelected,
                    ]}
                  >
                    {n}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
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
  // Slightly larger than the default Chip — used for the "I'm here
  // for" + "Show me" rows where the chips are the primary affordance
  // on the screen.
  bigChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  // Age dropdown
  dropdownWrap: { flex: 1, position: "relative" },
  dropdownTrigger: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  dropdownValue: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 20,
    color: colors.neutral.charcoal,
  },
  // Floats below the trigger; capped height so we don't push other
  // sections off-screen on small phones.
  dropdownPanel: {
    position: "absolute",
    top: 76,
    left: 0,
    right: 0,
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
    zIndex: 20,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  dropdownScroll: {
    maxHeight: 240,
  },
  dropdownItem: {
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  dropdownItemSelected: {
    backgroundColor: "rgba(140,82,255,0.08)",
  },
  // iOS-native-feeling list rows: body font (Helvetica), no rounded
  // display face, hairline separator between each row.
  dropdownItemText: {
    fontFamily: fonts.body,
    fontWeight: "400",
    fontSize: 18,
    color: colors.neutral.charcoal,
  },
  dropdownItemTextSelected: {
    color: colors.primary.wannaPurple,
    fontWeight: "600",
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
