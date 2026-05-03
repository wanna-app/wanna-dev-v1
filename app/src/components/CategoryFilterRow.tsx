import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Icon, IconName } from "./Icon";
import { ACTIVITY_CATEGORIES, ActivityCategory } from "../constants/categories";
import { categoryIcons, fonts } from "../theme";

interface Props {
  /** null = "For you" (default ranking, no category filter). */
  active: ActivityCategory | null;
  onChange: (next: ActivityCategory | null) => void;
}

/**
 * Horizontal scrolling chip row for Discover's category filter. Shows
 * "For you" (default, brand purple when active) plus one chip per
 * activity category. All chips render in glass style — translucent
 * white over the photo — and the active chip uses the brand purple.
 */
export function CategoryFilterRow({ active, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Chip
          label="For you"
          iconName="Sparkle"
          isActive={active === null}
          onPress={() => onChange(null)}
        />
        {ACTIVITY_CATEGORIES.map((c) => {
          const iconName = (categoryIcons[c] ?? "Sparkle") as IconName;
          // Show short labels in chips (just the part before "&")
          const shortLabel = c.split(" & ")[0];
          return (
            <Chip
              key={c}
              label={shortLabel}
              iconName={iconName}
              isActive={active === c}
              onPress={() => onChange(c)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  iconName,
  isActive,
  onPress,
}: {
  label: string;
  iconName: IconName;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        isActive ? styles.chipActive : styles.chipGlass,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Icon
        name={iconName}
        size={13}
        color={isActive ? "#FFFFFF" : "#FFFFFF"}
        weight="bold"
      />
      <Text style={[styles.label, isActive && styles.labelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  row: {
    paddingHorizontal: 18,
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
  },
  chipGlass: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.32)",
  },
  chipActive: {
    backgroundColor: "#8C52FF",
    borderColor: "#8C52FF",
  },
  label: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 12,
    color: "rgba(255,255,255,0.95)",
  },
  labelActive: {
    color: "#FFFFFF",
  },
});
