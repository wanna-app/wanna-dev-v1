import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CategoryPill } from "../../components/CategoryPill";
import { Icon } from "../../components/Icon";
import { supabase } from "../../lib/supabase";
import type { Activity } from "../../types/database";
import {
  categoryGradients,
  colors,
  fonts,
  fontSizes,
  shadows,
  spacing,
} from "../../theme";

interface RouteParams {
  activityId: string;
}

/**
 * Read-only detail view of one of the viewer's posted activities. Reached
 * from the WhosInQueueScreen banner. Editing is on the roadmap — for now
 * the "Edit activity" button just shows a placeholder alert.
 */
export function ActivityDetailScreen({ navigation, route }: any) {
  const { activityId } = route.params as RouteParams;
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("activities")
        .select(
          "id,user_id,title,description,category,intent,intents,location_lat,location_lng,location_name,activity_date,link,photo_url,photo_source,photo_attribution,is_seed,status,created_at,updated_at"
        )
        .eq("id", activityId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setActivity(null);
        setLoading(false);
        return;
      }
      setActivity(data as Activity);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  const handleEdit = () => {
    Alert.alert(
      "Coming soon",
      "Edit posted activity is on the roadmap"
    );
  };

  const formattedDate = activity?.activity_date
    ? new Date(activity.activity_date + "T00:00:00").toLocaleDateString(
        undefined,
        { weekday: "long", month: "short", day: "numeric" }
      )
    : null;

  const fallbackGradient = (activity
    ? categoryGradients[activity.category] ?? [
        colors.primary.softViolet,
        colors.primary.wannaPurple,
        colors.secondary.wannaCyan,
      ]
    : [colors.primary.wannaPurple, colors.secondary.wannaCyan]) as unknown as readonly [string, string, ...string[]];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Icon
            name="CaretLeft"
            size={22}
            color={colors.neutral.charcoal}
            weight="bold"
          />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Activity</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
        </View>
      ) : !activity ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Activity not found.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroWrap}>
            {activity.photo_url ? (
              <Image
                source={{ uri: activity.photo_url }}
                style={styles.hero}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient colors={fallbackGradient} style={styles.hero} />
            )}
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>{activity.title}</Text>

            <View style={styles.chipRow}>
              <CategoryPill category={activity.category} />
              {activity.intents.map((mode) => (
                <View key={mode} style={styles.intentChip}>
                  <Text style={styles.intentChipText}>{mode}</Text>
                </View>
              ))}
            </View>

            {(activity.location_name || formattedDate) && (
              <View style={styles.metaCard}>
                {activity.location_name && (
                  <View style={styles.metaRow}>
                    <Icon
                      name="MapPin"
                      size={16}
                      color={colors.primary.wannaPurple}
                      weight="bold"
                    />
                    <Text style={styles.metaText}>{activity.location_name}</Text>
                  </View>
                )}
                {formattedDate && (
                  <View style={styles.metaRow}>
                    <Icon
                      name="CalendarBlank"
                      size={16}
                      color={colors.primary.wannaPurple}
                      weight="bold"
                    />
                    <Text style={styles.metaText}>{formattedDate}</Text>
                  </View>
                )}
              </View>
            )}

            {activity.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Description</Text>
                <Text style={styles.descText}>{activity.description}</Text>
              </View>
            ) : null}

            {activity.link ? (
              <Pressable
                style={styles.linkRow}
                onPress={() => Linking.openURL(activity.link as string)}
              >
                <Text style={styles.linkText} numberOfLines={1}>
                  {activity.link}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Pressable style={styles.editBtn} onPress={handleEdit}>
              <Icon
                name="PencilSimple"
                size={16}
                color={colors.primary.wannaPurple}
                weight="bold"
              />
              <Text style={styles.editLabel}>Edit activity</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.subtle },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.neutral.charcoal,
    fontWeight: "700",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.neutral.slate },
  scroll: { paddingBottom: spacing.xxl },
  heroWrap: {
    width: "100%",
    height: 280,
    overflow: "hidden",
    backgroundColor: colors.bg.subtle,
  },
  hero: { width: "100%", height: "100%" },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 24,
    color: colors.neutral.charcoal,
    letterSpacing: -0.4,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  intentChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: "rgba(140,82,255,0.1)",
  },
  intentChipText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary.wannaPurple,
    textTransform: "capitalize",
  },
  metaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    ...shadows.sm,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaText: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    fontWeight: "600",
    flex: 1,
  },
  section: { gap: 6 },
  sectionLabel: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    color: colors.fg.secondary,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  descText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.neutral.charcoal,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    ...shadows.sm,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.primary.wannaPurple,
    backgroundColor: "#FFFFFF",
  },
  editLabel: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary.wannaPurple,
  },
});
