export { colors, categoryGradients, categoryIcons } from "./colors";
export { fonts, fontSizes } from "./typography";

// 8-pt rhythm + 4-pt half-step (matches mockup brand guide v1)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  // Aliased numeric scale for places that prefer "space-3" style
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
  s7: 48,
  s8: 64,
  s9: 96,
} as const;

export const borderRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  card: 20,
  button: 9999,
  pill: 9999,
  full: 9999,
} as const;

// Elevation tokens — drop-shadow values for cards, modals, brand CTAs.
// React Native shadows expect separate `shadowColor`, `shadowOffset`,
// `shadowOpacity`, `shadowRadius`, plus `elevation` for Android.
export const shadows = {
  sm: {
    shadowColor: "#2D2D3A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#2D2D3A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: "#4A2299",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 40,
    elevation: 12,
  },
  brand: {
    shadowColor: "#8C52FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 30,
    elevation: 14,
  },
} as const;
