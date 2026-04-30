import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ModerationHomeScreen } from "../screens/moderation/ModerationHomeScreen";
import { ReportsQueueScreen } from "../screens/moderation/ReportsQueueScreen";
import { PhotoFlagsQueueScreen } from "../screens/moderation/PhotoFlagsQueueScreen";
import { VerificationsQueueScreen } from "../screens/moderation/VerificationsQueueScreen";

const Stack = createNativeStackNavigator();

export function ModerationStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ModerationHome" component={ModerationHomeScreen} />
      <Stack.Screen name="ReportsQueue" component={ReportsQueueScreen} />
      <Stack.Screen name="PhotoFlagsQueue" component={PhotoFlagsQueueScreen} />
      <Stack.Screen
        name="VerificationsQueue"
        component={VerificationsQueueScreen}
      />
    </Stack.Navigator>
  );
}
