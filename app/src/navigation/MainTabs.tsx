import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PlaceholderScreen } from "../screens/main/PlaceholderScreen";
import { PostActivityScreen } from "../screens/main/PostActivityScreen";
import { DiscoverScreen } from "../screens/main/DiscoverScreen";
import { colors } from "../theme";

const Tab = createBottomTabNavigator();

const tabIcon = (emoji: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: focused ? 26 : 22, opacity: focused ? 1 : 0.6 }}>
    {emoji}
  </Text>
);

export function MainTabs() {
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
      }}
    >
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{ tabBarIcon: tabIcon("🧭") }}
      />
      <Tab.Screen
        name="WhosIn"
        options={{ tabBarIcon: tabIcon("🙌"), title: "Who's In" }}
      >
        {() => (
          <PlaceholderScreen
            title="Who's In"
            description="Your posted activities and interested users."
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Post"
        component={PostActivityScreen}
        options={{ tabBarIcon: tabIcon("➕"), title: "Post" }}
      />
      <Tab.Screen
        name="Matches"
        options={{ tabBarIcon: tabIcon("💬") }}
      >
        {() => (
          <PlaceholderScreen
            title="Matches"
            description="Conversations with people you've matched with."
          />
        )}
      </Tab.Screen>
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
