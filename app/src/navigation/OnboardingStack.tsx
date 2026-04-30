import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { OnboardingProvider } from "../hooks/useOnboarding";
import { NameScreen } from "../screens/onboarding/NameScreen";
import { DOBScreen } from "../screens/onboarding/DOBScreen";
import { GenderScreen } from "../screens/onboarding/GenderScreen";
import { PhotosScreen } from "../screens/onboarding/PhotosScreen";
import { VerificationPromptScreen } from "../screens/onboarding/VerificationPromptScreen";
import { PreferencesScreen } from "../screens/onboarding/PreferencesScreen";

const Stack = createNativeStackNavigator();

export function OnboardingStack() {
  return (
    <OnboardingProvider>
      <Stack.Navigator
        screenOptions={{ headerShown: false, gestureEnabled: false }}
      >
        <Stack.Screen name="Name" component={NameScreen} />
        <Stack.Screen name="DOB" component={DOBScreen} />
        <Stack.Screen name="GenderScreen" component={GenderScreen} />
        <Stack.Screen name="Photos" component={PhotosScreen} />
        <Stack.Screen
          name="Verification"
          component={VerificationPromptScreen}
        />
        <Stack.Screen name="Preferences" component={PreferencesScreen} />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}
