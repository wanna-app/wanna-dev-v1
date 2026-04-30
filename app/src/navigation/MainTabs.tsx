import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PostActivityScreen } from "../screens/main/PostActivityScreen";
import { DiscoverScreen } from "../screens/main/DiscoverScreen";
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

const tabIcon = (emoji: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: focused ? 26 : 22, opacity: focused ? 1 : 0.6 }}>
    {emoji}
  </Text>
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
        component={DiscoverScreen}
        options={{ tabBarIcon: tabIcon("🧭") }}
      />
      <Tab.Screen
        name="WhosIn"
        component={WhosInStack}
        options={{
          tabBarIcon: tabIcon("🙌"),
          title: "Who's In",
          tabBarBadge: pendingInterest > 0 ? pendingInterest : undefined,
        }}
      />
      <Tab.Screen
        name="Post"
        component={PostActivityScreen}
        options={{ tabBarIcon: tabIcon("➕"), title: "Post" }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesStack}
        options={{
          tabBarIcon: tabIcon("💬"),
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ tabBarIcon: tabIcon("👤") }}
      />
      {isModerator && (
        <Tab.Screen
          name="Moderation"
          component={ModerationStack}
          options={{
            tabBarIcon: tabIcon("🛡️"),
            title: "Mod",
            tabBarBadge: pendingMod > 0 ? pendingMod : undefined,
          }}
        />
      )}
    </Tab.Navigator>
  );
}
