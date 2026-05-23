/**
 * Discover / Welcome tab — the marketing & brand-storytelling home screen.
 *
 * This is the FIRST tab in the bottom bar. It reuses the same content as the
 * pre-login landing page (/app/index.tsx) so logged-in riders can come back
 * to read about the fleet, services, policies, and dispatch number any time
 * by tapping the HOME tab.
 *
 * Differences from the pre-login landing page:
 *   - Sign-in pill is hidden when the user is already authenticated.
 *   - Primary CTA ("Book a Ride") routes to the booking home (`/home` tab)
 *     instead of the auth flow.
 *   - No auto-redirect away from this screen (the pre-login screen redirects
 *     logged-in users to /home — here we let them stay).
 */
import { useState } from "react";
import { View, Text, StyleSheet, ImageBackground, Pressable, Image, ScrollView, Linking } from "react-native";
import { useRouter } from "expo-router";
import {
  Sparkles, Plane, Heart, Briefcase, Clock, Music4, Wine, Star, MapPin,
  Phone, ShieldCheck, ArrowRight, ChevronDown, ChevronUp, Globe, FileText,
  Calendar, AlertCircle,
} from "lucide-react-native";
import { colors, radius, assets } from "@/theme";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/store/auth";

const FLEET = [
  { name: "Executive Sedan", model: "Cadillac XTS · Mercedes E-Class", img: "https://images.unsplash.com/photo-1657980928345-2c89a303a695?fm=jpg&q=70&w=1200", cap: "1–3" },
  { name: "First Class", model: "Mercedes S-Class · BMW 7", img: "https://images.unsplash.com/photo-1609521247503-8de40462e427?fm=jpg&q=70&w=1200", cap: "1–3" },
  { name: "Luxury SUV", model: "Escalade · Yukon Denali", img: "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?fm=jpg&q=70&w=1200", cap: "1–6" },
  { name: "Stretch Limo", model: "Hummer · Chrysler 300", img: "https://images.unsplash.com/photo-1676107648535-931375db52e2?fm=jpg&q=70&w=1200", cap: "8–14" },
  { name: "Sprinter Van", model: "Mercedes Jet Sprinter", img: "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp", cap: "10–14" },
  { name: "Party Bus", model: "14–30 Passenger Coach", img: "https://images.unsplash.com/photo-1545185105-a81262517cf4?fm=jpg&q=70&w=1200", cap: "14–30" },
];

const SERVICES = [
  { icon: Plane, title: "Airport", text: "SFO · OAK · SJC" },
  { icon: Briefcase, title: "Corporate", text: "Executive transport" },
  { icon: Heart, title: "Weddings", text: "Choreographed timing" },
  { icon: Clock, title: "Hourly", text: "As-directed bookings" },
  { icon: Wine, title: "Wine Tours", text: "Napa · Sonoma" },
  { icon: Music4, title: "Nightlife", text: "Prom & parties" },
];

const POLICIES = [
  { id: "cancel", icon: Calendar, title: "Cancellation & changes", body: "Free cancellation up to 24 hours before pickup — full refund. Inside 24 hours, 50% fee. Inside 2 hours of pickup, non-refundable. Schedule changes are free anytime, subject to availability." },
  { id: "wait", icon: Clock, title: "Wait time & damages", body: "Airport pickups include a 45-minute grace period after your flight lands. All other trips include a 15-minute grace period. Beyond that, per-minute wait fee applies based on vehicle class." },
  { id: "privacy", icon: ShieldCheck, title: "Privacy & data", body: "We collect only what's needed to confirm and fulfill your ride. Payments processed by Stripe. We never sell your data." },
  { id: "terms", icon: FileText, title: "Terms of service", body: "All chauffeurs are TSA-screened, licensed, and fully insured. Service subject to availability. Surge pricing shown transparently at quote time." },
];

export default function DiscoverTab() {
  const router = useRouter();
  const user = useAuth(s => s.user);
  const insets = useSafeAreaInsets();
  const [openPolicy, setOpenPolicy] = useState<string | null>(null);

  // For logged-in riders: "Book a Ride" goes straight to the booking home.
  // For guests: it goes to sign-in.
  const goBook = () => router.push(user ? "/(rider)/(tabs)/home" : "/(rider)/auth");
  const goSignIn = () => router.push("/(rider)/auth");
  const callDispatch = () => Linking.openURL("tel:+16504100687");
  const openWebsite = () => Linking.openURL("https://www.turanelitelimo.com");

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* HERO */}
        <ImageBackground source={{ uri: assets.abstractGold }} style={s.hero} resizeMode="cover" imageStyle={{ opacity: 0.45 }}>
          <View style={s.heroDim} />
          <SafeAreaView style={s.heroSafe} edges={["top"]}>
            <View style={s.heroTopRow}>
              <Image source={{ uri: assets.logoMark }} style={s.logo} resizeMode="contain" />
              <View style={s.heroTopRight}>
                <Pressable testID="discover-call" onPress={callDispatch} style={s.callBtn} hitSlop={8}>
                  <Phone size={11} color={colors.gold} />
                </Pressable>
                {/* Sign-in pill only shown to guests. Logged-in riders see
                    nothing here — they're already authenticated. */}
                {!user && (
                  <Pressable testID="discover-signin" onPress={goSignIn} style={s.signInPill} hitSlop={8}>
                    <Text style={s.signInPillTxt}>Sign In</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={s.heroBody}>
              <View style={s.eyebrow}>
                <Sparkles size={11} color={colors.gold} />
                <Text style={s.eyebrowTxt}>BAY AREA · NORCAL</Text>
              </View>
              <Text style={s.h1}>Arrive in</Text>
              <Text style={s.h1Em}>unspoken luxury.</Text>
              <Text style={s.heroLede}>
                A private chauffeur service for those who measure travel by composure. Black-car sedans, luxury SUVs and stretch limousines across the Bay & beyond.
              </Text>

              <View style={s.trustRow}>
                <View style={s.trustItem}>
                  <View style={{ flexDirection: "row", gap: 1 }}>
                    {[0, 1, 2, 3, 4].map(i => <Star key={i} size={12} color={colors.gold} fill={colors.gold} />)}
                  </View>
                  <Text style={s.trustTxt}>5.0 · 1,200+ rides</Text>
                </View>
                <Text style={s.trustSep}>|</Text>
                <Text style={s.trustEm}><Text style={s.trustGold}>24/7</Text>  Dispatch</Text>
                <Text style={s.trustSep}>|</Text>
                <View style={s.trustItem}>
                  <ShieldCheck size={12} color={colors.gold} />
                  <Text style={s.trustTxt}>Fully insured</Text>
                </View>
              </View>

              <Pressable testID="discover-book" onPress={goBook} style={s.ctaPrimary}>
                <Text style={s.ctaPrimaryTxt}>
                  {user ? "Book a Ride" : "See pricing — no sign-up needed"}
                </Text>
                <ArrowRight size={14} color="#000" />
              </Pressable>

              {!user && (
                <Pressable onPress={goSignIn} hitSlop={8}>
                  <Text style={s.signLink}>Already have an account? <Text style={{ textDecorationLine: "underline" }}>Sign in</Text></Text>
                </Pressable>
              )}
            </View>
          </SafeAreaView>
        </ImageBackground>

        {/* FLEET */}
        <View style={s.section}>
          <Text style={s.sectionNum}>01 — THE FLEET</Text>
          <Text style={s.sectionH2}>A class for <Text style={{ color: colors.gold, fontStyle: "italic" }}>every journey.</Text></Text>
          <Text style={s.sectionLede}>
            From discreet executive sedans to celebration coaches — every vehicle in our network is under three years old, fully insured, and detailed before each ride.
          </Text>
          <View style={s.fleetGrid}>
            {FLEET.map((v) => (
              <View key={v.name} style={s.fleetCard}>
                <ImageBackground source={{ uri: v.img }} style={s.fleetImg} imageStyle={{ borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
                  <View style={s.fleetCap}><Text style={s.fleetCapTxt}>{v.cap} pax</Text></View>
                </ImageBackground>
                <View style={s.fleetMeta}>
                  <Text style={s.fleetName}>{v.name}</Text>
                  <Text style={s.fleetModel}>{v.model}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* SERVICES */}
        <View style={s.section}>
          <Text style={s.sectionNum}>02 — SERVICES</Text>
          <Text style={s.sectionH2}>From the runway to the <Text style={{ color: colors.gold, fontStyle: "italic" }}>vineyard.</Text></Text>
          <View style={s.svcGrid}>
            {SERVICES.map((sv) => (
              <View key={sv.title} style={s.svcCard}>
                <sv.icon size={16} color={colors.gold} />
                <Text style={s.svcTitle}>{sv.title}</Text>
                <Text style={s.svcTxt}>{sv.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* POLICIES — collapsible */}
        <View style={s.section}>
          <Text style={s.sectionNum}>03 — POLICIES</Text>
          <Text style={s.sectionH2}>Clear & <Text style={{ color: colors.gold, fontStyle: "italic" }}>upfront.</Text></Text>
          {POLICIES.map((p) => {
            const open = openPolicy === p.id;
            return (
              <Pressable
                key={p.id}
                testID={`discover-policy-${p.id}`}
                onPress={() => setOpenPolicy(open ? null : p.id)}
                style={s.policyRow}
              >
                <View style={s.policyHead}>
                  <p.icon size={14} color={colors.gold} />
                  <Text style={s.policyTitle}>{p.title}</Text>
                  {open
                    ? <ChevronUp size={14} color="rgba(255,255,255,0.5)" />
                    : <ChevronDown size={14} color="rgba(255,255,255,0.5)" />}
                </View>
                {open && <Text style={s.policyBody}>{p.body}</Text>}
              </Pressable>
            );
          })}
        </View>

        {/* CONTACT */}
        <View style={[s.section, { paddingBottom: 28 }]}>
          <View style={s.contactCard}>
            <Sparkles size={16} color={colors.gold} />
            <Text style={s.contactTitle}>24/7 Dispatch</Text>
            <Text style={s.contactSub}>Talk to a human, any hour. We answer in under 30 seconds.</Text>
            <Pressable testID="discover-call-cta" onPress={callDispatch} style={s.contactBtn}>
              <Phone size={13} color="#000" />
              <Text style={s.contactBtnTxt}>(650) 410-0687</Text>
            </Pressable>
            <Pressable testID="discover-website" onPress={openWebsite} hitSlop={8}>
              <View style={s.websiteLink}>
                <Globe size={11} color={colors.gold} />
                <Text style={s.websiteTxt}>www.turanelitelimo.com</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// Reusable styles — kept inline so the discover screen stays self-contained.
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  hero: { paddingBottom: 24 },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.65)" },
  heroSafe: { paddingHorizontal: 20 },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 32 },
  logo: { width: 44, height: 44 },
  heroTopRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  callBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  signInPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  signInPillTxt: { color: "#fff", fontSize: 12, fontWeight: "500" },
  heroBody: { paddingTop: 4 },
  eyebrow: { flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 16 },
  eyebrowTxt: { color: colors.gold, fontSize: 11, letterSpacing: 2, fontWeight: "500" },
  h1: { color: "#fff", fontSize: 44, fontWeight: "300", lineHeight: 48 },
  h1Em: { color: colors.gold, fontSize: 44, fontStyle: "italic", fontWeight: "300", lineHeight: 50, marginBottom: 16 },
  heroLede: { color: "rgba(255,255,255,0.65)", fontSize: 14, lineHeight: 22, marginBottom: 22 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  trustItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  trustTxt: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  trustEm: { color: "#fff", fontSize: 11 },
  trustGold: { color: colors.gold, fontWeight: "600", fontSize: 13 },
  trustSep: { color: "rgba(255,255,255,0.2)" },
  ctaPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: colors.gold, paddingVertical: 14, borderRadius: 999, gap: 8,
    marginBottom: 12,
  },
  ctaPrimaryTxt: { color: "#000", fontSize: 14, fontWeight: "600" },
  signLink: { color: "rgba(255,255,255,0.6)", textAlign: "center", fontSize: 12, paddingTop: 4 },

  section: { paddingHorizontal: 20, paddingTop: 36 },
  sectionNum: { color: colors.gold, fontSize: 10, letterSpacing: 2, marginBottom: 10 },
  sectionH2: { color: "#fff", fontSize: 28, fontWeight: "300", lineHeight: 32, marginBottom: 12 },
  sectionLede: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 20, marginBottom: 20 },

  fleetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fleetCard: { width: "48%", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.lg, overflow: "hidden" },
  fleetImg: { height: 110, justifyContent: "flex-end", alignItems: "flex-start", padding: 8 },
  fleetCap: { backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  fleetCapTxt: { color: "#fff", fontSize: 10, fontWeight: "500" },
  fleetMeta: { padding: 10 },
  fleetName: { color: "#fff", fontSize: 13, fontWeight: "500" },
  fleetModel: { color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 },

  svcGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  svcCard: { width: "31.5%", padding: 12, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.lg, alignItems: "flex-start" },
  svcTitle: { color: "#fff", fontSize: 12, fontWeight: "500", marginTop: 8 },
  svcTxt: { color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 },

  policyRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  policyHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  policyTitle: { color: "#fff", fontSize: 13, flex: 1 },
  policyBody: { color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 18, marginTop: 10, paddingRight: 8 },

  contactCard: {
    padding: 20, backgroundColor: "rgba(212,175,55,0.06)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.2)",
    borderRadius: radius.lg, alignItems: "center",
  },
  contactTitle: { color: "#fff", fontSize: 18, fontWeight: "400", marginTop: 8 },
  contactSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, textAlign: "center", marginTop: 4, marginBottom: 14 },
  contactBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 22, paddingVertical: 11, backgroundColor: colors.gold, borderRadius: 999 },
  contactBtnTxt: { color: "#000", fontSize: 13, fontWeight: "600" },
  websiteLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  websiteTxt: { color: colors.gold, fontSize: 11, textDecorationLine: "underline" },
});
