import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MatchesListScreen } from "../screens/main/MatchesListScreen";
import { ChatScreen } from "../screens/main/ChatScreen";

const Stack = createNativeStackNavigator();

export function MatchesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MatchesList" component={MatchesListScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
    </Stack.Navigator>
  );
}
