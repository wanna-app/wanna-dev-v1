import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { useAuth } from "../hooks/useAuth";
import {
  MeetupChecksProvider,
  useMeetupChecks,
} from "../hooks/useMeetupChecks";
import { usePushRegistration } from "../hooks/usePushRegistration";
import { MeetupCheckModal } from "../components/MeetupCheckModal";
import { AuthStack } from "./AuthStack";
import { OnboardingStack } from "./OnboardingStack";
import { MainTabs } from "./MainTabs";
import { BannedScreen } from "../screens/BannedScreen";
import { colors } from "../theme";

function GlobalMeetupCheckModal() {
  const { pending, recordYes, recordNotYet, dismiss } = useMeetupChecks();
  return (
    <MeetupCheckModal
      check={pending}
      onYes={recordYes}
      onNotYet={recordNotYet}
      onDismiss={dismiss}
    />
  );
}

function PushRegistrar() {
  usePushRegistration();
  return null;
}

export function RootNavigator() {
  const { session, profile, onboardingState, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
      </View>
    );
  }

  if (!session) {
    return (
      <NavigationContainer>
        <AuthStack />
      </NavigationContainer>
    );
  }

  if (onboardingState === "needs_onboarding") {
    return (
      <NavigationContainer>
        <OnboardingStack />
      </NavigationContainer>
    );
  }

  // Suspension gate — checked on every launch and re-render of RootNavigator.
  // profile.is_active === false covers both temp bans and permanent bans.
  // The BannedScreen shows the reason + expiry (if temp) and a sign-out button.
  if (profile && !profile.is_active) {
    return <BannedScreen />;
  }

  // Authenticated + onboarded + active — wrap MainTabs in the meetup-check
  // provider so the modal can fire on every foreground. Also register the
  // device's Expo push token while we have a session.
  return (
    <MeetupChecksProvider>
      <PushRegistrar />
      <NavigationContainer>
        <MainTabs />
      </NavigationContainer>
      <GlobalMeetupCheckModal />
    </MeetupChecksProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neutral.white,
  },
});
