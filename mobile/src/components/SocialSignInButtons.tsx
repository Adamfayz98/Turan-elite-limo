/**
 * Reusable social sign-in buttons (Apple + Google).
 *
 * - Apple button shows only on iOS where `expo-apple-authentication` is
 *   available (Android Apple sign-in is deferred to v1.2 via a web flow).
 * - Google button shows on both platforms once `googleSignIn` extra config
 *   is populated.
 *
 * Both buttons:
 *   1. Trigger the native provider flow
 *   2. Receive the provider's identity token
 *   3. POST to /api/customer/oauth/<provider> for server-side verification
 *   4. Store the returned JWT + customer + go to /home
 */
import { useState } from "react";
import { View, Text, Platform, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import { colors } from "@/theme";
import { loginRiderWithApple, loginRiderWithGoogle } from "@/api";
import { useAuth } from "@/store/auth";
import { registerForPushAsync } from "@/push";
import { isGoogleSignInConfigured } from "@/auth/googleSignIn";

type Props = {
  onError?: (message: string) => void;
};

export default function SocialSignInButtons({ onError }: Props) {
  const router = useRouter();
  const setUser = useAuth(s => s.setUser);
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);

  const finishLogin = (data: any) => {
    setUser(data.user);
    registerForPushAsync("rider").catch(() => {});
    router.replace("/home");
  };

  const handleApple = async () => {
    if (busy) return;
    setBusy("apple");
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("Apple did not return an identity token.");
      }
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const data = await loginRiderWithApple(credential.identityToken, fullName || undefined);
      finishLogin(data);
    } catch (e: any) {
      if (e?.code === "ERR_CANCELED" || e?.code === "ERR_REQUEST_CANCELED") {
        // User dismissed the sheet — silent.
      } else {
        const msg = e?.response?.data?.detail || e?.message || "Apple sign-in failed.";
        onError ? onError(msg) : Alert.alert("Sign in failed", msg);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy("google");
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result: any = await GoogleSignin.signIn();
      // SDK v16 returns { type: 'success', data: {...} } or { type: 'cancelled' }
      if (result?.type === "cancelled") {
        return;
      }
      const tokens = await GoogleSignin.getTokens();
      if (!tokens?.idToken) {
        throw new Error("Google did not return an identity token.");
      }
      const user = result?.data?.user || result?.user;
      const fullName = user?.name || undefined;
      const data = await loginRiderWithGoogle(tokens.idToken, fullName);
      finishLogin(data);
    } catch (e: any) {
      if (
        e?.code === statusCodes.SIGN_IN_CANCELLED ||
        e?.code === statusCodes.IN_PROGRESS ||
        e?.code === "SIGN_IN_CANCELLED"
      ) {
        // silent on cancel
      } else if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        const m = "Google Play Services not available on this device.";
        onError ? onError(m) : Alert.alert("Sign in failed", m);
      } else {
        const msg = e?.response?.data?.detail || e?.message || "Google sign-in failed.";
        onError ? onError(msg) : Alert.alert("Sign in failed", msg);
      }
    } finally {
      setBusy(null);
    }
  };

  const googleAvailable = isGoogleSignInConfigured();
  const appleAvailable = Platform.OS === "ios";

  if (!appleAvailable && !googleAvailable) {
    return null;
  }

  return (
    <View style={s.wrap}>
      <View style={s.dividerRow}>
        <View style={s.dividerLine} />
        <Text style={s.dividerTxt}>OR</Text>
        <View style={s.dividerLine} />
      </View>

      {appleAvailable && (
        <Pressable
          testID="social-signin-apple"
          onPress={handleApple}
          disabled={!!busy}
          style={({ pressed }) => [s.btn, s.appleBtn, pressed && { opacity: 0.85 }]}
        >
          {busy === "apple" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={s.appleLogo}></Text>
              <Text style={s.appleTxt}>Continue with Apple</Text>
            </>
          )}
        </Pressable>
      )}

      {googleAvailable && (
        <Pressable
          testID="social-signin-google"
          onPress={handleGoogle}
          disabled={!!busy}
          style={({ pressed }) => [s.btn, s.googleBtn, pressed && { opacity: 0.9 }]}
        >
          {busy === "google" ? (
            <ActivityIndicator color="#1f1f1f" />
          ) : (
            <>
              <Text style={s.googleLogo}>G</Text>
              <Text style={s.googleTxt}>Continue with Google</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12, marginTop: 22 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.18)" },
  dividerTxt: { color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 2, fontWeight: "600" },
  btn: {
    height: 48,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  appleBtn: { backgroundColor: "#000", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.25)" },
  appleLogo: { color: "#fff", fontSize: 18, marginTop: -2 },
  appleTxt: { color: "#fff", fontSize: 14, fontWeight: "600" },
  googleBtn: { backgroundColor: "#fff" },
  googleLogo: { color: "#4285F4", fontSize: 18, fontWeight: "700" },
  googleTxt: { color: "#1f1f1f", fontSize: 14, fontWeight: "600" },
});
