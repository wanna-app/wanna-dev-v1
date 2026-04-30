import React, { createContext, useContext, useState } from "react";
import type { Gender, FrequencyOption, PoliticalOrientation, StarSign } from "../constants/enums";

export interface OnboardingData {
  first_name: string;
  date_of_birth: string;
  gender: Gender | null;
  photos: string[];
  activity_preferences: string[];
  bio: string;
  profession: string;
  university: string;
  political_orientation: PoliticalOrientation | null;
  alcohol: FrequencyOption | null;
  marijuana: FrequencyOption | null;
  star_sign: StarSign | null;
}

const initialData: OnboardingData = {
  first_name: "",
  date_of_birth: "",
  gender: null,
  photos: [],
  activity_preferences: [],
  bio: "",
  profession: "",
  university: "",
  political_orientation: null,
  alcohol: null,
  marijuana: null,
  star_sign: null,
};

interface OnboardingContextValue {
  data: OnboardingData;
  update: (partial: Partial<OnboardingData>) => void;
  reset: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(
  undefined
);

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState<OnboardingData>(initialData);

  const update = (partial: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  };

  const reset = () => setData(initialData);

  return (
    <OnboardingContext.Provider value={{ data, update, reset }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx)
    throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
