import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { useAuth } from "../hooks/useAuth";
import {
  MeetupChecksProvider,
  useMeetupChecks,
} from "../hooks/useMeetupChecks";
import { usePushRegistration } from "../hooks/usePushRegistration";
import { useEmailConfirmation } from "../hooks/useEmailConfirmation";
import { MeetupCheckModal } from "../components/MeetupCheckModal";
import { ConfirmEmailModal } from "../components/ConfirmEmailModal";
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

// Closeable "confirm your email" nudge. Rendered inside any session-bearing
// branch (onboarding + main tabs) so unconfirmed users get prompted on every
// app open until they confirm. No-ops for confirmed / OAuth users.
function GlobalConfirmEmailModal() {
  const { visible, email, resending, resend, dismiss } = useEmailConfirmation();
  return (
    <ConfirmEmailModal
      visible={visible}
      email={email}
      resending={resending}
      onResend={resend}
      onDismiss={dismiss}
    />
  );
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
      <>
        <NavigationContainer>
          <OnboardingStack />
        </NavigationContainer>
        <GlobalConfirmEmailModal />
      </>
    );
  }

  // Suspension gate — only triggers for moderator bans (ban_reason or
  // banned_until set). User-initiated deactivation also flips is_active=false
  // but is auto-reactivated by useAuth on login, so it never reaches here.
  // This prevents the BannedScreen from flashing for users who simply
  // deactivated their own account and are now signing back in.
  const isBanned =
    profile &&
    !profile.is_active &&
    (profile.ban_reason || profile.banned_until);
  if (isBanned) {
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
      <GlobalConfirmEmailModal />
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
