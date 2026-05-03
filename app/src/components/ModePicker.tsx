import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Icon, IconName } from "./Icon";
import { fonts, fontSizes } from "../theme";

export type Mode = "friends" | "dating" | "networking";

interface ModeMeta {
  label: string;
  color: string;
  iconName: IconName;
}

// Per-mode color + label. Friends = brand purple, Dates = system pink,
// Networking = bright blue.
export const MODE_META: Record<Mode, ModeMeta> = {
  friends: {
    label: "Friends",
    color: "#8C52FF",
    iconName: "UsersThree",
  },
  dating: {
    label: "Dates",
    color: "#FF5C7A",
    iconName: "Heart",
  },
  networking: {
    label: "Networking",
    color: "#1E90FF",
    iconName: "Briefcase",
  },
};

interface Props {
  visible: boolean;
  current: Mode;
  onClose: () => void;
  onSelect: (mode: Mode) => void;
}

/**
 * Bottom-sheet picker for the Discover top-right mode pill. Shows three
 * color-coded rows; tap a row to switch modes. Background is a translucent
 * dim that dismisses on tap.
 */
export function ModePicker({ visible, current, onClose, onSelect }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.dim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Who do you wanna meet?</Text>
          {(Object.entries(MODE_META) as [Mode, ModeMeta][]).map(
            ([mode, meta]) => {
              const active = mode === current;
              return (
                <Pressable
                  key={mode}
                  onPress={() => {
                    onSelect(mode);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    active && {
                      borderColor: meta.color,
                      backgroundColor: meta.color + "12",
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View
                    style={[
                      styles.rowIcon,
                      { backgroundColor: meta.color },
                    ]}
                  >
                    <Icon
                      name={meta.iconName}
                      size={18}
                      color="#FFFFFF"
                      weight={mode === "dating" ? "fill" : "bold"}
                    />
                  </View>
                  <Text style={[styles.rowLabel, { color: meta.color }]}>
                    {meta.label}
                  </Text>
                  {active && (
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: meta.color },
                      ]}
                    />
                  )}
                </Pressable>
              );
            }
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    gap: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 9999,
    backgroundColor: "#DDDDE3",
    alignSelf: "center",
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: "700",
    color: "#2D2D3A",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#ECECEF",
    backgroundColor: "#FAFAFB",
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: "700",
  },
  rowDesc: {
    fontSize: 12,
    color: "#5A5A6B",
    marginTop: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 9999,
  },
});
