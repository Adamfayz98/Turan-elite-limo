import { TextInput, View, Text, StyleSheet, TextInputProps } from "react-native";
import { ReactNode } from "react";
import { colors, radius } from "@/theme";

interface Props extends TextInputProps {
  label?: string;
  icon?: ReactNode;
  rightIcon?: ReactNode;
}

export default function Input({ label, icon, rightIcon, style, ...rest }: Props) {
  return (
    <View style={s.wrap}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={s.box}>
        {icon && <View style={s.icon}>{icon}</View>}
        <TextInput
          placeholderTextColor="rgba(255,255,255,0.30)"
          style={[s.input, icon && { paddingLeft: 38 }, rightIcon && { paddingRight: 38 }, style]}
          {...rest}
        />
        {rightIcon && <View style={s.rightIcon}>{rightIcon}</View>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: "100%" },
  label: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.45)",
    marginBottom: 6,
    fontWeight: "500",
  },
  box: { position: "relative", width: "100%" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 14,
  },
  icon: {
    position: "absolute",
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
  rightIcon: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
});
