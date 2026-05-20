import { useEffect } from "react";
import { View, Text, StyleSheet, ImageBackground, Pressable, Image, ScrollView, Linking } from "react-native";
import { useRouter } from "expo-router";
import {
  ChevronRight,
  Crown,
  Sparkles,
  Plane,
  Heart,
  Briefcase,
  Clock,
  Music4,
  Wine,
  Star,
  MapPin,
  Phone,
  ShieldCheck,
  ArrowRight,
} from "lucide-react-native";
import { colors, radius, assets } from "@/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/store/auth";

const FLEET = [
  {
    name: "Executive Sedan",
    model: "Cadillac XTS · Mercedes E-Class",
    img: "https://images.unsplash.com/photo-1657980928345-2c89a303a695?fm=jpg&q=70&w=1200",
    cap: "1–3",
  },
  {
    name: "First Class",
    model: "Mercedes S-Class · BMW 7",
    img: "https://images.unsplash.com/photo-1609521247503-8de40462e427?fm=jpg&q=70&w=1200",
    cap: "1–3",
  },
  {
    name: "Luxury SUV",
    model: "Escalade · Yukon Denali",
    img: "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?fm=jpg&q=70&w=1200",
    cap: "1–6",
  },
  {
    name: "Stretch Limo",
    model: "Hummer · Chrysler 300",
    img: "https://images.unsplash.com/photo-1676107648535-931375db52e2?fm=jpg&q=70&w=1200",
    cap: "8–14",
  },
  {
    name: "Sprinter Van",
    model: "Mercedes Jet Sprinter",
    img: "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp",
    cap: "10–14",
  },
  {
    name: "Party Bus",
    model: "14–30 Passenger Coach",
    img: "https://images.unsplash.com/photo-1545185105-a81262517cf4?fm=jpg&q=70&w=1200",
    cap: "14–30",
  },
];

const SERVICES = [
  { icon: Plane, title: "Airport", text: "SFO · OAK · SJC" },
  { icon: Briefcase, title: "Corporate", text: "Executive transport" },
  { icon: Heart, title: "Weddings", text: "Choreographed timing" },
  { icon: Clock, title: "Hourly", text: "As-directed bookings" },
  { icon: Wine, title: "Wine Tours", text: "Napa · Sonoma" },
  { icon: Music4, title: "Nightlife", text: "Prom & parties" },
];

const CITIES = [
  "San Francisco", "Oakland", "Palo Alto", "San Jose", "Napa",
  "Sonoma", "Berkeley", "Sausalito", "Half Moon Bay", "Monterey",
  "Sacramento", "Livermore",
];

const REVIEWS = [
  { name: "Sarah K.", text: "Showed up early for our SFO red-eye. Spotless car, gracious driver. Will only use TuranEliteLimo from now on.", initials: "SK" },
  { name: "Marcus T.", text: "Booked a Sprinter for our wedding party. Champagne ready, ribbons on the door. Worth every dollar.", initials: "MT" },
  { name: "Priya R.", text: "Napa wine tour was flawless. Driver knew every winery. Best $ we spent on the trip.", initials: "PR" },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const user = useAuth(s => s.user);

  // Authenticated riders skip the marketing experience and go to their home.
  useEffect(() => {
    if (user) router.replace("/home");
  }, [user]);

  const goRider = () => router.push("/(rider)/auth");
  const goDriver = () => router.push("/(driver)/auth");
  const callDispatch = () => Linking.openURL("tel:+16504100687");

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* HERO */}
        <ImageBackground source={{ uri: assets.abstractGold }} style={s.hero} resizeMode="cover" imageStyle={{ opacity: 0.45 }}>
          <View style={s.heroDim} />
          <SafeAreaView style={s.heroSafe} edges={["top"]}>
            <View style={s.heroTopRow}>
              <Image source={{ uri: assets.logoMark }} style={s.logo} resizeMode="contain" />
              <Pressable testID="welcome-call-btn" onPress={callDispatch} style={s.callBtn} hitSlop={8}>
                <Phone size={12} color={colors.gold} />
                <Text style={s.callBtnTxt}>(650) 410-0687</Text>
              </Pressable>
            </View>
            <View style={s.heroBody}>
              <View style={s.tagRow}>
                <Sparkles size={11} color={colors.gold} />
                <Text style={s.tag}>BAY AREA · NORCAL</Text>
              </View>
              <Text style={s.h1}>Arrive in</Text>
              <Text style={s.h1Em}>unspoken luxury.</Text>
              <Text style={s.heroSub}>
                A private chauffeur service for those who measure travel by composure. Black-car sedans, luxury SUVs and stretch limousines across the Bay & beyond.
              </Text>
              <View style={s.heroStats}>
                <View style={s.statBlock}>
                  <View style={s.starRow}>
                    {[...Array(5)].map((_, i) => <Star key={i} size={10} color={colors.gold} fill={colors.gold} />)}
                  </View>
                  <Text style={s.statTxt}>5.0 · 1,200+ rides</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statBlock}>
                  <Text style={s.statBig}>24/7</Text>
                  <Text style={s.statTxt}>Dispatch</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statBlock}>
                  <ShieldCheck size={14} color={colors.gold} />
                  <Text style={s.statTxt}>Fully insured</Text>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </ImageBackground>

        {/* FLEET CAROUSEL */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>01 — THE FLEET</Text>
          <Text style={s.sectionH2}>
            Six vehicles. <Text style={s.italic}>One standard.</Text>
          </Text>
          <Text style={s.sectionSub}>
            Every vehicle is under three years old, fully insured, and detailed before each ride.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fleetScroll}>
            {FLEET.map((v, i) => (
              <View key={v.name} testID={`welcome-fleet-${i}`} style={s.fleetCard}>
                <ImageBackground source={{ uri: v.img }} style={s.fleetImg} imageStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                  <View style={s.fleetImgDim} />
                  <Text style={s.fleetCap}>{v.cap} pax</Text>
                </ImageBackground>
                <View style={s.fleetBody}>
                  <Text style={s.fleetName}>{v.name}</Text>
                  <Text style={s.fleetModel}>{v.model}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* SERVICES */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>02 — SERVICES</Text>
          <Text style={s.sectionH2}>
            Six ways we keep you <Text style={s.italic}>moving.</Text>
          </Text>
          <View style={s.servicesGrid}>
            {SERVICES.map((srv, i) => {
              const Icon = srv.icon;
              return (
                <View key={srv.title} testID={`welcome-service-${i}`} style={s.serviceCard}>
                  <View style={s.serviceIcon}><Icon size={16} color={colors.gold} strokeWidth={1.6} /></View>
                  <Text style={s.serviceTitle}>{srv.title}</Text>
                  <Text style={s.serviceTxt}>{srv.text}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* COVERAGE */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>03 — COVERAGE</Text>
          <Text style={s.sectionH2}>
            All of <Text style={s.italic}>Northern California.</Text>
          </Text>
          <Text style={s.sectionSub}>
            From Marin to Monterey, curbside to door — across thirty-plus cities.
          </Text>
          <View style={s.airportRow}>
            {["SFO", "OAK", "SJC"].map(code => (
              <View key={code} style={s.airportPill}>
                <Plane size={11} color={colors.gold} />
                <Text style={s.airportTxt}>{code}</Text>
              </View>
            ))}
          </View>
          <View style={s.citiesWrap}>
            {CITIES.map(c => (
              <View key={c} style={s.cityChip}>
                <MapPin size={9} color="rgba(255,255,255,0.4)" />
                <Text style={s.cityTxt}>{c}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* REVIEWS */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>04 — REVIEWS</Text>
          <Text style={s.sectionH2}>
            What riders <Text style={s.italic}>say.</Text>
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.reviewScroll}>
            {REVIEWS.map((r, i) => (
              <View key={r.name} testID={`welcome-review-${i}`} style={s.reviewCard}>
                <View style={s.reviewStars}>
                  {[...Array(5)].map((_, k) => <Star key={k} size={10} color={colors.gold} fill={colors.gold} />)}
                </View>
                <Text style={s.reviewTxt}>“{r.text}”</Text>
                <View style={s.reviewAuthor}>
                  <View style={s.avatar}><Text style={s.avatarTxt}>{r.initials}</Text></View>
                  <Text style={s.reviewName}>{r.name}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* FINAL CTA */}
        <View style={[s.section, s.ctaBlock]}>
          <Text style={s.ctaH2}>
            Ready to <Text style={s.italic}>ride?</Text>
          </Text>
          <Text style={s.ctaSub}>
            Create an account in seconds. Live quote, instant confirmation.
          </Text>

          <Pressable testID="welcome-rider-cta" onPress={goRider} style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}>
            <Crown size={15} color="#000" strokeWidth={1.8} />
            <Text style={s.primaryBtnTxt}>Sign in / Book a ride</Text>
            <ArrowRight size={14} color="#000" />
          </Pressable>

          <Pressable testID="welcome-driver-cta" onPress={goDriver} hitSlop={8} style={s.driverLink}>
            <Briefcase size={12} color="rgba(255,255,255,0.55)" />
            <Text style={s.driverLinkTxt}>I'm a driver — sign in</Text>
            <ChevronRight size={12} color="rgba(255,255,255,0.55)" />
          </Pressable>

          <Text style={s.footerTxt}>
            © {new Date().getFullYear()} TuranEliteLimo · Bay Area & Northern California
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 0 },

  // HERO
  hero: { width: "100%", minHeight: 520, position: "relative" },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.62)" },
  heroSafe: { flex: 1, paddingHorizontal: 22, paddingBottom: 32 },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  logo: { width: 40, height: 40 },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)", backgroundColor: "rgba(212,175,55,0.08)" },
  callBtnTxt: { color: colors.gold, fontSize: 11, fontWeight: "600" },
  heroBody: { marginTop: 48 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  tag: { color: colors.gold, fontSize: 10, letterSpacing: 3, fontWeight: "600" },
  h1: { color: "#fff", fontSize: 38, lineHeight: 42, fontWeight: "400" },
  h1Em: { color: colors.gold, fontSize: 38, lineHeight: 42, fontStyle: "italic", marginTop: 2 },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 19, marginTop: 18, maxWidth: 320 },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: 26, gap: 14 },
  statBlock: { flexDirection: "row", alignItems: "center", gap: 6 },
  starRow: { flexDirection: "row", gap: 1 },
  statBig: { color: colors.gold, fontSize: 13, fontWeight: "700" },
  statTxt: { color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 0.5 },
  statDivider: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.15)" },

  // SECTIONS
  section: { paddingHorizontal: 22, paddingTop: 44, paddingBottom: 8 },
  sectionLabel: { color: colors.gold, fontSize: 10, letterSpacing: 3, fontWeight: "600", marginBottom: 10 },
  sectionH2: { color: "#fff", fontSize: 26, lineHeight: 30, fontWeight: "400" },
  italic: { color: colors.gold, fontStyle: "italic" },
  sectionSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 18, marginTop: 10, maxWidth: 320 },

  // FLEET
  fleetScroll: { paddingTop: 18, paddingRight: 22, gap: 12 },
  fleetCard: { width: 220, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.surface, overflow: "hidden" },
  fleetImg: { height: 130, justifyContent: "flex-end" },
  fleetImgDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.18)" },
  fleetCap: { position: "absolute", top: 10, left: 10, color: "#fff", fontSize: 10, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  fleetBody: { padding: 12 },
  fleetName: { color: "#fff", fontSize: 13, fontWeight: "500" },
  fleetModel: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },

  // SERVICES
  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  serviceCard: { width: "47.5%", padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.surface },
  serviceIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.1)", borderWidth: 1, borderColor: "rgba(212,175,55,0.25)", marginBottom: 10 },
  serviceTitle: { color: "#fff", fontSize: 13, fontWeight: "500" },
  serviceTxt: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },

  // COVERAGE
  airportRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  airportPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(212,175,55,0.08)", borderWidth: 1, borderColor: "rgba(212,175,55,0.3)" },
  airportTxt: { color: colors.gold, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  citiesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  cityChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  cityTxt: { color: "rgba(255,255,255,0.65)", fontSize: 10 },

  // REVIEWS
  reviewScroll: { paddingTop: 18, paddingRight: 22, gap: 12 },
  reviewCard: { width: 260, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.surface },
  reviewStars: { flexDirection: "row", gap: 2, marginBottom: 10 },
  reviewTxt: { color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 18 },
  reviewAuthor: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.15)", borderWidth: 1, borderColor: "rgba(212,175,55,0.3)" },
  avatarTxt: { color: colors.gold, fontSize: 10, fontWeight: "700" },
  reviewName: { color: "rgba(255,255,255,0.7)", fontSize: 11 },

  // CTA
  ctaBlock: { paddingBottom: 44, alignItems: "center" },
  ctaH2: { color: "#fff", fontSize: 28, lineHeight: 32, fontWeight: "400", textAlign: "center", marginTop: 8 },
  ctaSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 8, textAlign: "center" },
  primaryBtn: { marginTop: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 26, borderRadius: 999, backgroundColor: colors.gold, width: "100%" },
  primaryBtnTxt: { color: "#000", fontSize: 14, fontWeight: "600" },
  driverLink: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  driverLinkTxt: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  footerTxt: { color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 26, textAlign: "center" },
});
