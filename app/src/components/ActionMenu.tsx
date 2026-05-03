import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, fontSizes, shadows, spacing } from "../theme";

export interface ActionMenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface ActionMenuProps {
  visible: boolean;
  /** Optional small caption above the actions (e.g. user's first name). */
  title?: string;
  items: ActionMenuItem[];
  onClose: () => void;
}

/**
 * Native-feeling bottom action sheet. We rolled our own (instead of
 * leaning on `ActionSheetIOS`) because the platform dialog kept
 * rendering as a stacked pill alert in the middle of the screen on
 * some iOS configurations, which looked off. This component:
 *
 *   - always slides up from the bottom (sheet style)
 *   - groups items into a single rounded card with hairline separators
 *   - has a separate Cancel card below (iOS convention)
 *   - dims the backdrop and dismisses on tap
 *
 * Visually mirrors iOS UIAlertController.actionSheet so it still feels
 * native on Android too.
 */
export function ActionMenu({ visible, title, items, onClose }: ActionMenuProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        {/* Stop propagation so taps inside the sheet don't dismiss it */}
        <Pressable onPress={(e) => e.stopPropagation?.()}>
          <SafeAreaView edges={["bottom"]} style={styles.safe}>
            <View style={styles.actionsCard}>
              {title ? (
                <View style={styles.titleRow}>
                  <Text style={styles.titleText}>{title}</Text>
                </View>
              ) : null}
              {items.map((item, idx) => (
                <Pressable
                  key={item.label}
                  onPress={() => {
                    onClose();
                    // Defer so the dismiss animation can complete before
                    // the destination presents (e.g. an Alert.alert).
                    setTimeout(item.onPress, 80);
                  }}
                  style={({ pressed }) => [
                    styles.itemRow,
                    idx > 0 || title ? styles.itemRowDivider : null,
                    pressed && styles.itemRowPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.itemText,
                      item.destructive && styles.itemTextDestructive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelCard,
                pressed && styles.itemRowPressed,
              ]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  safe: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  actionsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    ...shadows.md,
  },
  titleRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  titleText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: "600",
    color: colors.fg.secondary,
  },
  itemRow: {
    paddingVertical: 16,
    alignItems: "center",
  },
  itemRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
  itemRowPressed: {
    backgroundColor: colors.bg.subtle,
  },
  itemText: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.primary.wannaPurple,
    fontWeight: "500",
  },
  itemTextDestructive: {
    color: "#E53E3E",
  },
  cancelCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    ...shadows.md,
  },
  cancelText: {
    fontFamily: fonts.heading,
    fontSize: 17,
    fontWeight: "700",
    color: colors.primary.wannaPurple,
  },
});
