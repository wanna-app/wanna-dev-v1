import React, { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../hooks/useOnboarding";
import { colors, spacing, fontSizes } from "../../theme";

interface Props {
  navigation: any;
}

function calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function DOBScreen({ navigation }: Props) {
  const { data, update } = useOnboarding();
  const [date, setDate] = useState<Date>(
    data.date_of_birth ? new Date(data.date_of_birth) : new Date(2000, 0, 1)
  );
  const [error, setError] = useState("");

  const handleNext = () => {
    const age = calculateAge(date);
    if (age < 18) {
      setError("You must be 18 or older to use Wanna.");
      return;
    }
    if (age > 100) {
      setError("Please enter a valid date of birth.");
      return;
    }
    update({ date_of_birth: date.toISOString().split("T")[0] });
    navigation.navigate("GenderScreen");
  };

  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - 18);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ProgressBar step={2} totalSteps={6} />
        <Text style={styles.title}>When were you born?</Text>
        <Text style={styles.subtitle}>
          You must be 18 or older. This can't be changed later.
        </Text>
        <View style={styles.pickerWrapper}>
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={maxDate}
            minimumDate={new Date(1924, 0, 1)}
            onChange={(_, d) => {
              if (d) {
                setDate(d);
                setError("");
              }
            }}
            textColor={colors.neutral.charcoal}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.footer}>
        <Button label="Next" variant="gradient" onPress={handleNext} />
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
  pickerWrapper: {
    alignItems: "center",
  },
  error: {
    color: "#E53E3E",
    fontSize: fontSizes.caption,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
