import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { DiscoverScreen } from "../screens/main/DiscoverScreen";
import { UserProfileScreen } from "../screens/profile/UserProfileScreen";
import { ActivityDetailScreen } from "../screens/main/ActivityDetailScreen";

const Stack = createNativeStackNavigator();

/**
 * Discover tab stack. Wraps DiscoverScreen so we can push to UserProfile
 * (when the host pill on an activity card is tapped) without leaving the
 * Discover tab.
 */
export function DiscoverStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DiscoverHome" component={DiscoverScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} />
    </Stack.Navigator>
  );
}
