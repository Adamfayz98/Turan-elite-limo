import { Pressable, Text, View, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { ReactNode } from "react";
import { colors, radius } from "@/theme";

type Variant = "primary" | "outline" | "ghost";

interface Props {
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
  icon?: ReactNode;
  style?: ViewStyle;
  testID?: string;
}

export default function Button({ onPress, variant = "primary", loading, disabled, children, icon, style, testID }: Props) {
  const isDisabled = disabled || loading;
  const containerStyle = [
    s.base,
    variant === "primary" && s.primary,
    variant === "outline" && s.outline,
    variant === "ghost" && s.ghost,
    isDisabled && { opacity: 0.5 },
    style,
  ];
  const textStyle = [
    s.text,
    variant === "primary" && s.textPrimary,
    variant === "outline" && s.textOutline,
    variant === "ghost" && s.textGhost,
  ];
  return (
    <Pressable testID={testID} disabled={isDisabled} onPress={onPress} style={({ pressed }) => [containerStyle, pressed && { opacity: 0.85 }]}>
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#000" : colors.gold} />
      ) : (
        <View style={s.row}>
          {icon}
          <Text style={textStyle}>{children}</Text>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  primary: {
    backgroundColor: colors.gold,
    shadowColor: colors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.5)",
  },
  ghost: {
    backgroundColor: "transparent",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  text: { fontSize: 14, fontWeight: "600" },
  textPrimary: { color: "#000" },
  textOutline: { color: colors.gold },
  textGhost: { color: colors.textSecondary },
});
