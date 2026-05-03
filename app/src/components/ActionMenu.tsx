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
      // 'fade' avoids the wipe-up animation that read like a
      // PowerPoint transition; the scrim simply fades in/out and the
      // sheet appears with it.
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Outer flex column with the dim scrim on top and the sheet
          anchored to the bottom. The previous nested-Pressable
          layout was sizing itself to its content and getting clipped
          off-screen on shorter devices, which cut off the Cancel
          card. Using justifyContent:flex-end with explicit children
          keeps the sheet pinned to the bottom regardless of height. */}
      <View style={styles.outer}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={styles.sheetWrap}>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    // Lighter dim (was 0.35) — feels like a subtle shadow rather
    // than a hard scrim, matching iOS native action sheets.
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  sheetWrap: {
    // Sits on top of the scrim. Doesn't grow beyond its content so
    // the Cancel card always lines up with the bottom safe area
    // instead of being pushed off-screen.
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
    fontFamily: fonts.body,
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
  // Body font (Helvetica), smaller + regular weight per design
  // feedback. Cancel matches so the whole sheet reads at one weight.
  itemText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "400",
    color: colors.neutral.charcoal,
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
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "400",
    color: colors.neutral.charcoal,
  },
});
