import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MatchesListScreen } from "../screens/main/MatchesListScreen";
import { ChatScreen } from "../screens/main/ChatScreen";
import { UserProfileScreen } from "../screens/profile/UserProfileScreen";
import { ActivityDetailScreen } from "../screens/main/ActivityDetailScreen";
import { PostActivityScreen } from "../screens/main/PostActivityScreen";

const Stack = createNativeStackNavigator();

export function MatchesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MatchesList" component={MatchesListScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} />
      <Stack.Screen name="EditActivity" component={PostActivityScreen} />
    </Stack.Navigator>
  );
}
