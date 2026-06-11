/**
 * Universal/App Link landing for referral invites: https://turanelitelimo.com/r/REF-XXXXXX
 *
 * Mirrors the web page at frontend/src/pages/ReferralRedirect.jsx:
 * - Validates the code against GET /api/referral/check/{code}
 * - Persists the code locally so signup flows (email + social) attribute the referrer
 * - Routes new riders to signup with the invite locked in
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, ImageBackground, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gift, ArrowRight } from "lucide-react-native";
import Button from "@/components/Button";
import { colors, assets } from "@/theme";
import { api } from "@/api";
import { savePendingReferral } from "@/referral";
import { useAuth } from "@/store/auth";

export default function ReferralInvite() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const user = useAuth(s => s.user);
  const [state, setState] = useState<{ loading: boolean; valid: boolean; referrerName: string | null }>({
    loading: true,
    valid: false,
    referrerName: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code) {
        setState({ loading: false, valid: false, referrerName: null });
        return;
      }
      try {
        const { data } = await api.get(`/api/referral/check/${encodeURIComponent(String(code))}`);
        if (cancelled) return;
        if (data?.valid) {
          await savePendingReferral(String(code), data.referrer_name || null);
          setState({ loading: false, valid: true, referrerName: data.referrer_name || null });
        } else {
          setState({ loading: false, valid: false, referrerName: null });
        }
      } catch {
        if (!cancelled) setState({ loading: false, valid: false, referrerName: null });
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  return (
    <View style={s.root}>
      <ImageBackground source={{ uri: assets.abstractGold }} style={s.heroBg} resizeMode="cover" imageStyle={{ opacity: 0.5 }}>
        <View style={s.heroDim} />
      </ImageBackground>

      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          <Image source={{ uri: assets.logoMark }} style={s.logo} resizeMode="contain" />

          {state.loading ? (
            <View style={s.center} testID="referral-invite-loading">
              <ActivityIndicator color={colors.gold} />
              <Text style={s.loadingTxt}>Checking your invite…</Text>
            </View>
          ) : state.valid ? (
            <View testID="referral-invite-valid">
              <View style={s.giftBadge}>
                <Gift size={22} color={colors.gold} strokeWidth={1.8} />
              </View>
              <Text style={s.kicker}>YOU'RE INVITED</Text>
              <Text style={s.h1}>
                {state.referrerName ? (
                  <>
                    <Text style={s.h1Gold}>{state.referrerName}</Text> sent you{" "}
                    <Text style={s.h1Gold}>$20 off</Text> your first ride
                  </>
                ) : (
                  <>
                    Welcome! <Text style={s.h1Gold}>$20 off</Text> your first ride
                  </>
                )}
              </Text>
              <Text style={s.sub}>
                Promo code <Text style={s.mono}>WELCOME20</Text> is locked in for your account.
                Book any chauffeur trip and we'll deduct $20 at checkout.
              </Text>

              {user ? (
                <>
                  <Text style={s.note}>
                    You're already signed in — invites are for new riders, but you can still book your next trip.
                  </Text>
                  <Button
                    testID="referral-invite-home"
                    onPress={() => router.replace("/home")}
                    icon={<ArrowRight size={14} color="#000" />}
                    style={{ marginTop: 24 }}
                  >
                    Book a Ride
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    testID="referral-invite-signup"
                    onPress={() => router.replace("/(rider)/auth?mode=signup")}
                    icon={<ArrowRight size={14} color="#000" />}
                    style={{ marginTop: 28 }}
                  >
                    Claim $20 & Create Account
                  </Button>
                  <Text style={s.note}>
                    When you complete your first ride, {state.referrerName || "your friend"} earns a $25-off promo too.
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View testID="referral-invite-invalid">
              <Text style={s.kicker}>INVITE LINK</Text>
              <Text style={s.h1}>
                This invite link <Text style={s.h1Gold}>isn't valid</Text>
              </Text>
              <Text style={s.sub}>
                It may have expired or the code was mistyped. You can still book a chauffeur ride and use any active promo.
              </Text>
              <Button
                testID="referral-invite-continue"
                variant="outline"
                onPress={() => router.replace(user ? "/home" : "/")}
                style={{ marginTop: 28 }}
              >
                Continue to TuranEliteLimo
              </Button>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heroBg: { position: "absolute", top: 0, left: 0, right: 0, height: 300 },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.6)" },
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 28, justifyContent: "center" },
  logo: { width: 44, height: 44, marginBottom: 28, opacity: 0.95 },
  center: { alignItems: "flex-start", gap: 12 },
  loadingTxt: { color: "rgba(255,255,255,0.6)", fontSize: 14 },
  giftBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(212,175,55,0.12)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  kicker: { color: colors.gold, fontSize: 11, letterSpacing: 4, marginBottom: 14 },
  h1: { color: "#fff", fontSize: 30, lineHeight: 38, fontWeight: "300" },
  h1Gold: { color: colors.gold, fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 22, marginTop: 16 },
  mono: { color: colors.gold, fontWeight: "700" },
  note: { color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 18, marginTop: 18 },
});
