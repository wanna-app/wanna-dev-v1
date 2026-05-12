import React, { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../hooks/useOnboarding";
import { colors, spacing, borderRadius, fontSizes } from "../../theme";

interface Props {
  navigation: any;
}

const MAX_PHOTOS = 6;

export function PhotosScreen({ navigation }: Props) {
  const { data, update } = useOnboarding();
  const [photos, setPhotos] = useState<string[]>(data.photos);

  const pickImage = async (slot: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "We need photo library access to upload photos."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 5],
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    const next = [...photos];
    next[slot] = uri;
    setPhotos(next.filter(Boolean));
  };

  const removePhoto = (slot: number) => {
    const next = photos.filter((_, i) => i !== slot);
    setPhotos(next);
  };

  const handleNext = () => {
    if (photos.length < 1) {
      Alert.alert("Add a photo", "At least one photo is required.");
      return;
    }
    update({ photos });
    navigation.navigate("Verification");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ProgressBar step={4} totalSteps={6} />
        <Text style={styles.title}>Add your photos</Text>
        <Text style={styles.subtitle}>
          Add 1–6 photos. Drag the first to the front — it's your primary.
        </Text>

        <View style={styles.grid}>
          {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
            const photo = photos[i];
            return (
              <Pressable
                key={i}
                style={styles.slot}
                onPress={() => (photo ? removePhoto(i) : pickImage(i))}
              >
                {photo ? (
                  <>
                    <Image source={{ uri: photo }} style={styles.image} />
                    <View style={styles.removeBadge}>
                      <Text style={styles.removeText}>×</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.plus}>+</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.footer}>
        <Button
          label={`Next (${photos.length}/${MAX_PHOTOS})`}
          variant="gradient"
          onPress={handleNext}
          disabled={photos.length < 1}
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  slot: {
    width: "31%",
    aspectRatio: 4 / 5,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  plus: {
    fontSize: 40,
    lineHeight: 40,
    color: colors.primary.wannaPurple,
    fontWeight: "300",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  removeBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    color: colors.neutral.white,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 20,
  },
});
