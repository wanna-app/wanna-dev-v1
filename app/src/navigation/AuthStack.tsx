import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { EmailSignUpScreen } from "../screens/EmailSignUpScreen";
import { EmailSignInScreen } from "../screens/EmailSignInScreen";

const Stack = createNativeStackNavigator();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="EmailSignUp" component={EmailSignUpScreen} />
      <Stack.Screen name="EmailSignIn" component={EmailSignInScreen} />
    </Stack.Navigator>
  );
}
