import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { WhosInListScreen } from "../screens/main/WhosInListScreen";
import { WhosInQueueScreen } from "../screens/main/WhosInQueueScreen";

const Stack = createNativeStackNavigator();

export function WhosInStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WhosInList" component={WhosInListScreen} />
      <Stack.Screen name="WhosInQueue" component={WhosInQueueScreen} />
    </Stack.Navigator>
  );
}
