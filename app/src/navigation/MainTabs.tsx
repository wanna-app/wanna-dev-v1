import React from "react";
import { StyleSheet, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Plus } from "phosphor-react-native";
import { PostActivityScreen } from "../screens/main/PostActivityScreen";
import { DiscoverStack } from "./DiscoverStack";
import { WhosInStack } from "./WhosInStack";
import { MatchesStack } from "./MatchesStack";
import { ProfileStack } from "./ProfileStack";
import { ModerationStack } from "./ModerationStack";
import { usePendingInterestBadge } from "../hooks/usePendingInterestBadge";
import { useUnreadMessagesBadge } from "../hooks/useUnreadMessagesBadge";
import { usePushNavigation } from "../hooks/usePushNavigation";
import { useModeratorStatus } from "../hooks/useModeratorStatus";
import { colors } from "../theme";

const Tab = createBottomTabNavigator();

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

const tabIcon =
  (iconName: IoniconsName, iconNameFocused?: IoniconsName) =>
  ({ focused, color, size }: { focused: boolean; color: string; size: number }) =>
    (
      <Ionicons
        name={focused ? (iconNameFocused ?? iconName) : iconName}
        size={size}
        color={color}
      />
    );

export function MainTabs() {
  const pendingInterest = usePendingInterestBadge();
  const unreadMessages = useUnreadMessagesBadge();
  const { isModerator, total: pendingMod } = useModeratorStatus();
  // Tap a push → navigate to the right screen
  usePushNavigation();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary.wannaPurple,
        tabBarInactiveTintColor: colors.neutral.slate,
        tabBarStyle: {
          backgroundColor: colors.neutral.white,
          borderTopColor: colors.neutral.cloud,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.primary.wannaPurple,
          color: colors.neutral.white,
        },
      }}
    >
      <Tab.Screen
        name="Discover"
        component={DiscoverStack}
        options={{ tabBarIcon: tabIcon("compass-outline", "compass") }}
      />
      <Tab.Screen
        name="WhosIn"
        component={WhosInStack}
        options={{
          tabBarIcon: tabIcon("people-outline", "people"),
          title: "Who's In",
          tabBarBadge: pendingInterest > 0 ? pendingInterest : undefined,
        }}
      />
      <Tab.Screen
        name="Post"
        component={PostActivityScreen}
        options={{
          tabBarIcon: () => (
            // Solid purple "+" disc. Wrapper translates the disc down so
            // its vertical center lines up with the (icon + label) center
            // of the neighbouring tabs — without this it'd sit too high
            // (just at the icon row) and look misaligned.
            <View style={postIcon.wrapper}>
              <View style={postIcon.disc}>
                <Plus size={20} color="#FFFFFF" weight="bold" />
              </View>
            </View>
          ),
          // No label below the disc — the gradient circle is the entire
          // affordance. Reserve the same vertical space the other labels
          // take so all 5 tab cells share the same height.
          tabBarLabel: () => null,
          // Hide accessibility 'Post' announcement-collision by keeping a
          // semantic title.
          title: "Post",
        }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesStack}
        options={{
          tabBarIcon: tabIcon("chatbubble-outline", "chatbubble"),
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ tabBarIcon: tabIcon("person-outline", "person") }}
      />
      {isModerator && (
        <Tab.Screen
          name="Moderation"
          component={ModerationStack}
          options={{
            tabBarIcon: tabIcon("shield-outline", "shield"),
            title: "Mod",
            tabBarBadge: pendingMod > 0 ? pendingMod : undefined,
          }}
        />
      )}
    </Tab.Navigator>
  );
}

const postIcon = StyleSheet.create({
  // Wrapper nudges the disc down by ~6pt so its vertical center matches
  // the icon-plus-label centroid of the neighbouring tabs. Without this
  // the disc sits at the icon row only and looks too high in the bar.
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  // Sized to fit inside a standard tab bar icon slot (~32pt) so the disc
  // sits cleanly within the bar instead of jutting out. Brand-color
  // drop shadow gives a subtle lift.
  disc: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: "#8C52FF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#8C52FF",
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
