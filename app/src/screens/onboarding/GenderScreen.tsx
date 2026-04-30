import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../hooks/useOnboarding";
import { GENDERS, Gender } from "../../constants/enums";
import { colors, spacing, fontSizes } from "../../theme";

interface Props {
  navigation: any;
}

const GENDER_LABELS: Record<Gender, string> = {
  man: "Man",
  woman: "Woman",
  nonbinary: "Nonbinary",
};

export function GenderScreen({ navigation }: Props) {
  const { data, update } = useOnboarding();
  const [gender, setGender] = useState<Gender | null>(data.gender);

  const handleNext = () => {
    if (!gender) return;
    update({ gender });
    navigation.navigate("Photos");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ProgressBar step={3} totalSteps={6} />
        <Text style={styles.title}>How do you identify?</Text>
        <Text style={styles.subtitle}>
          You'll be able to set who sees your profile next.
        </Text>
        <View style={styles.chips}>
          {GENDERS.map((g) => (
            <Chip
              key={g}
              label={GENDER_LABELS[g]}
              selected={gender === g}
              onPress={() => setGender(g)}
            />
          ))}
        </View>
      </View>
      <View style={styles.footer}>
        <Button
          label="Next"
          variant="gradient"
          onPress={handleNext}
          disabled={!gender}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  footer: {
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSizes.display,
    fontWeight: "800",
    color: colors.neutral.charcoal,
    marginTop: spacing.lg,
  },
  subtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
