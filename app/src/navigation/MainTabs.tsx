import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PlaceholderScreen } from "../screens/main/PlaceholderScreen";
import { PostActivityScreen } from "../screens/main/PostActivityScreen";
import { DiscoverScreen } from "../screens/main/DiscoverScreen";
import { WhosInStack } from "./WhosInStack";
import { MatchesStack } from "./MatchesStack";
import { usePendingInterestBadge } from "../hooks/usePendingInterestBadge";
import { useUnreadMessagesBadge } from "../hooks/useUnreadMessagesBadge";
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
        options={{ tabBarIcon: tabIcon("👤") }}
      >
        {() => (
          <PlaceholderScreen
            title="Profile"
            description="Your profile, settings, and discovery preferences."
            showSignOut
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
