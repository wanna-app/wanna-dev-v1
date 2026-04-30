import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { useAuth } from "../hooks/useAuth";
import { AuthStack } from "./AuthStack";
import { OnboardingStack } from "./OnboardingStack";
import { MainTabs } from "./MainTabs";
import { colors } from "../theme";

export function RootNavigator() {
  const { session, onboardingState, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!session ? (
        <AuthStack />
      ) : onboardingState === "needs_onboarding" ? (
        <OnboardingStack />
      ) : (
        <MainTabs />
      )}
    </NavigationContainer>
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
