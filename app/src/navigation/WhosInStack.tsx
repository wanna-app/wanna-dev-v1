import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityDetailScreen } from "../screens/main/ActivityDetailScreen";
import { PostActivityScreen } from "../screens/main/PostActivityScreen";
import { WhosInListScreen } from "../screens/main/WhosInListScreen";
import { WhosInQueueScreen } from "../screens/main/WhosInQueueScreen";
import { UserProfileScreen } from "../screens/profile/UserProfileScreen";

const Stack = createNativeStackNavigator();

export function WhosInStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WhosInList" component={WhosInListScreen} />
      <Stack.Screen name="WhosInQueue" component={WhosInQueueScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} />
      <Stack.Screen name="EditActivity" component={PostActivityScreen} />
    </Stack.Navigator>
  );
}
