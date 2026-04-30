import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { EditProfileScreen } from "../screens/profile/EditProfileScreen";
import { DiscoveryPreferencesScreen } from "../screens/profile/DiscoveryPreferencesScreen";
import { VerificationScreen } from "../screens/profile/VerificationScreen";
import { SettingsScreen } from "../screens/profile/SettingsScreen";
import { BlockListScreen } from "../screens/profile/BlockListScreen";

const Stack = createNativeStackNavigator();

export function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen
        name="DiscoveryPreferences"
        component={DiscoveryPreferencesScreen}
      />
      <Stack.Screen name="Verification" component={VerificationScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="BlockList" component={BlockListScreen} />
    </Stack.Navigator>
  );
}
