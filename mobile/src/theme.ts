/**
 * Design tokens for TuranEliteLimo mobile app.
 * Mirrors /app/design_guidelines.json so the native app stays in sync with web.
 */
export const colors = {
  bg: "#050505",
  surface: "#0C0C0C",
  surfaceElevated: "#141414",
  secondary: "#1A1A1A",
  gold: "#D4AF37",
  goldHover: "#C9A961",
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.55)",
  textMuted: "rgba(255,255,255,0.40)",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.12)",
  goldGlow: "rgba(212,175,55,0.25)",
  success: "#10B981",
  error: "#EF4444",
};

export const fonts = {
  display: "PlayfairDisplay",
  body: "System",
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/** Logo asset URLs. Hosted on customer-assets so they work in preview, production, and native builds without redeploy. */
export const assets = {
  logoMark: "https://turanelitelimo.com/logo-mark.png?v=4",
  logoFull: "https://turanelitelimo.com/logo-full.png?v=4",
  abstractGold: "https://static.prod-images.emergentagent.com/jobs/1689fe63-929d-4e0f-9a68-ee41e3772b20/images/552a1c8656efc0533fd136ccd9396126f7b4d6677e70677000c2f04374d4d979.png",
};
