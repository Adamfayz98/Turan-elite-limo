import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ImageBackground, Pressable, Image, ScrollView, Linking } from "react-native";
import { useRouter } from "expo-router";
import {
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
  ChevronDown,
  ChevronUp,
  Globe,
  FileText,
  Calendar,
  AlertCircle,
  Tag,
  Megaphone,
} from "lucide-react-native";
import { colors, radius, assets } from "@/theme";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/store/auth";
import { api } from "@/api";

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

const CITIES = [
  "San Francisco", "Oakland", "Palo Alto", "San Jose", "Napa", "Sonoma",
  "Berkeley", "Sausalito", "Half Moon Bay", "Monterey", "Sacramento", "Livermore",
];

const REVIEWS = [
  { name: "Sarah K.", text: "Showed up early for our SFO red-eye. Spotless car, gracious driver. Will only use TuranEliteLimo from now on.", initials: "SK" },
  { name: "Marcus T.", text: "Booked a Sprinter for our wedding party. Champagne ready, ribbons on the door. Worth every dollar.", initials: "MT" },
  { name: "Priya R.", text: "Napa wine tour was flawless. Driver knew every winery. Best $ we spent on the trip.", initials: "PR" },
];

const POLICIES = [
  {
    id: "cancellation",
    icon: Calendar,
    title: "Cancellation & changes",
    body: "Free cancellation up to 24 hours before pickup — full refund, no questions asked. Inside 24 hours, a 50% cancellation fee applies. Inside 2 hours of pickup, the reservation is non-refundable. Schedule changes are free anytime, subject to availability.",
  },
  {
    id: "wait",
    icon: Clock,
    title: "Wait time & damages",
    body: "Airport pickups include a 45-minute grace period after your flight lands. All other trips include a 15-minute grace period. Beyond that, a per-minute wait fee applies based on the selected vehicle class. If we wait 45 minutes beyond grace without contact, the reservation is treated as a no-show — no refund.\n\nDamages: If the vehicle is damaged, soiled, or requires special cleaning during your trip, the actual repair/cleaning cost may be charged to the card on file. Every charge is itemized with the reason and emailed to you.",
  },
  {
    id: "privacy",
    icon: ShieldCheck,
    title: "Privacy & data",
    body: "We collect only what's needed to confirm and fulfill your ride: name, contact info, pickup & drop-off, and payment details (processed by Stripe). We never sell your data. Location sharing during an active trip is optional and ends when the trip ends.",
  },
  {
    id: "terms",
    icon: FileText,
    title: "Terms of service",
    body: "By booking, you agree to TuranEliteLimo's Terms of Service. All chauffeurs are TSA-screened, licensed, and fully insured. Service is subject to availability. Surge pricing may apply on peak dates and is shown transparently at quote time.",
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const user = useAuth(s => s.user);
  const insets = useSafeAreaInsets();
  const [openPolicy, setOpenPolicy] = useState<string | null>(null);

  // Live promo + announcement banners — same admin-managed data shown to
  // signed-in riders on the in-app Home tab. Surfacing this to first-time
  // visitors too is critical: a "WELCOME20 · 20% off" banner in front of
  // someone deciding whether to sign up converts dramatically better than
  // hiding it until after sign-up.
  const [promo, setPromo] = useState<{ code: string; description: string; discount_type: string; value: number } | null>(null);
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; body?: string; cta_label?: string; cta_url?: string }[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get("/api/promos/banner").then(r => r.data).catch(() => null),
      api.get("/api/announcements").then(r => r.data).catch(() => ({ banner: [] })),
    ]).then(([p, a]) => {
      if (!alive) return;
      if (p && p.code) setPromo(p);
      if (a && Array.isArray(a.banner)) setAnnouncements(a.banner);
    });
    return () => { alive = false; };
  }, []);

  const promoLine = promo
    ? promo.discount_type === "percent" ? `${promo.value}% off` : `$${promo.value} off`
    : null;

  useEffect(() => {
    if (user) router.replace("/home");
  }, [user]);

  const goRider = () => router.push("/(rider)/auth");
  const goBrowse = () => router.push("/(rider)/(tabs)/home");
  const goDriver = () => router.push("/(driver)/auth");
  const callDispatch = () => Linking.openURL("tel:+16504100687");
  const openWebsite = () => Linking.openURL("https://www.turanelitelimo.com");
  const openAnnouncementCta = (url?: string) => { if (url) Linking.openURL(url); };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* HERO */}
        <ImageBackground source={{ uri: assets.abstractGold }} style={s.hero} resizeMode="cover" imageStyle={{ opacity: 0.45 }}>
          <View style={s.heroDim} />
          <SafeAreaView style={s.heroSafe} edges={["top"]}>
            {/* Top bar: logo + call + sign-in */}
            <View style={s.heroTopRow}>
              <Image source={{ uri: assets.logoMark }} style={s.logo} resizeMode="contain" />
              <View style={s.heroTopRight}>
                <Pressable testID="welcome-call" onPress={callDispatch} style={s.callBtn} hitSlop={8}>
                  <Phone size={11} color={colors.gold} />
                </Pressable>
                <Pressable testID="welcome-signin-top" onPress={goRider} style={s.signInPill} hitSlop={8}>
                  <Text style={s.signInPillTxt}>Sign In</Text>
                </Pressable>
              </View>
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

              {/* Hero CTAs */}
              <Pressable testID="welcome-browse-cta" onPress={goBrowse} style={({ pressed }) => [s.heroPrimary, pressed && { opacity: 0.85 }]}>
                <Text style={s.heroPrimaryTxt}>See pricing — no sign-up needed</Text>
                <ArrowRight size={14} color="#000" />
              </Pressable>
              <Pressable testID="welcome-signin-hero" onPress={goRider} hitSlop={6} style={s.heroSecondary}>
                <Text style={s.heroSecondaryTxt}>Already have an account? Sign in</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </ImageBackground>

        {/* PROMO + ANNOUNCEMENTS — admin-managed banners shown to visitors
            and signed-in users alike. Mirrors the in-app Home tab. */}
        {(promo || announcements.length > 0) && (
          <View style={s.bannerWrap}>
            {promo && (
              <Pressable testID="welcome-promo-banner" onPress={goBrowse} style={s.promoBanner}>
                <View style={s.promoIcon}><Tag size={14} color={colors.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.promoCode}>{promo.code} · {promoLine}</Text>
                  <Text style={s.promoDesc} numberOfLines={2}>{promo.description}</Text>
                </View>
                <ArrowRight size={14} color={colors.gold} />
              </Pressable>
            )}
            {announcements.map((a, i) => (
              <Pressable
                key={a.id || i}
                testID={`welcome-announcement-${i}`}
                onPress={() => openAnnouncementCta(a.cta_url)}
                style={s.announceBanner}
              >
                <View style={s.announceIcon}><Megaphone size={14} color={colors.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.announceTitle}>{a.title}</Text>
                  {a.body ? <Text style={s.announceBody} numberOfLines={2}>{a.body}</Text> : null}
                </View>
                {a.cta_url ? <ArrowRight size={13} color={colors.gold} /> : null}
              </Pressable>
            ))}
          </View>
        )}

        {/* FLEET */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>01 — THE FLEET</Text>
          <Text style={s.sectionH2}>
            A class for <Text style={s.italic}>every journey.</Text>
          </Text>
          <Text style={s.sectionSub}>
            From discreet executive sedans to celebration coaches — every vehicle in our network is under three years old, fully insured, and detailed before each ride.
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

        {/* POLICIES & TRUST */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>05 — POLICIES & TRUST</Text>
          <Text style={s.sectionH2}>
            Transparent <Text style={s.italic}>terms.</Text>
          </Text>
          <Text style={s.sectionSub}>
            Plain-English policies. Tap any card to read the details.
          </Text>
          <View style={s.policyList}>
            {POLICIES.map(p => {
              const Icon = p.icon;
              const isOpen = openPolicy === p.id;
              return (
                <Pressable
                  key={p.id}
                  testID={`welcome-policy-${p.id}`}
                  onPress={() => setOpenPolicy(isOpen ? null : p.id)}
                  style={s.policyCard}
                >
                  <View style={s.policyHead}>
                    <View style={s.policyIcon}><Icon size={14} color={colors.gold} /></View>
                    <Text style={s.policyTitle}>{p.title}</Text>
                    {isOpen ? <ChevronUp size={14} color="rgba(255,255,255,0.5)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.5)" />}
                  </View>
                  {isOpen && <Text style={s.policyBody}>{p.body}</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* FOOTER */}
        <View style={[s.section, { paddingBottom: 30 }]}>
          <View style={s.footerRow}>
            <Pressable testID="welcome-website-link" onPress={openWebsite} style={s.footerLink} hitSlop={6}>
              <Globe size={11} color={colors.gold} />
              <Text style={s.footerLinkTxt}>turanelitelimo.com</Text>
            </Pressable>
            <Pressable testID="welcome-call-footer" onPress={callDispatch} style={s.footerLink} hitSlop={6}>
              <Phone size={11} color={colors.gold} />
              <Text style={s.footerLinkTxt}>(650) 410-0687</Text>
            </Pressable>
          </View>
          <Pressable testID="welcome-driver-link" onPress={goDriver} hitSlop={6} style={s.driverLink}>
            <Briefcase size={11} color="rgba(255,255,255,0.45)" />
            <Text style={s.driverLinkTxt}>I'm a driver — sign in</Text>
          </Pressable>
          <Text style={s.footerTxt}>
            © {new Date().getFullYear()} TuranEliteLimo · Bay Area & Northern California
          </Text>
        </View>
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={[s.stickyBar, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable
          testID="welcome-sticky-book"
          onPress={goBrowse}
          style={({ pressed }) => [s.stickyBtn, pressed && { opacity: 0.88 }]}
        >
          <Text style={s.stickyBtnTxt}>Book a Ride</Text>
          <ArrowRight size={15} color="#000" />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // HERO
  hero: { width: "100%", minHeight: 600, position: "relative" },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.62)" },
  heroSafe: { flex: 1, paddingHorizontal: 22, paddingBottom: 32 },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  heroTopRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 42, height: 42 },
  callBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(212,175,55,0.4)", backgroundColor: "rgba(212,175,55,0.08)" },
  signInPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.06)" },
  signInPillTxt: { color: "#fff", fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
  heroBody: { marginTop: 44 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  tag: { color: colors.gold, fontSize: 10, letterSpacing: 3, fontWeight: "600" },
  h1: { color: "#fff", fontSize: 38, lineHeight: 42, fontWeight: "400" },
  h1Em: { color: colors.gold, fontSize: 38, lineHeight: 42, fontStyle: "italic", marginTop: 2 },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 19, marginTop: 18, maxWidth: 320 },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: 22, gap: 14 },
  statBlock: { flexDirection: "row", alignItems: "center", gap: 6 },
  starRow: { flexDirection: "row", gap: 1 },
  statBig: { color: colors.gold, fontSize: 13, fontWeight: "700" },
  statTxt: { color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 0.5 },
  statDivider: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.15)" },
  heroPrimary: { marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 999, backgroundColor: colors.gold, alignSelf: "flex-start" },
  heroPrimaryTxt: { color: "#000", fontSize: 13, fontWeight: "600" },
  heroSecondary: { marginTop: 10, paddingVertical: 6, alignSelf: "flex-start" },
  heroSecondaryTxt: { color: "rgba(255,255,255,0.65)", fontSize: 12, textDecorationLine: "underline", textDecorationColor: "rgba(255,255,255,0.3)" },

  // BANNERS — admin-managed promo + announcements row, rendered between
  // hero and Fleet section. Mirrors the in-app Home tab visual style.
  bannerWrap: { paddingHorizontal: 22, paddingTop: 22, gap: 10 },
  promoBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "rgba(212,175,55,0.35)", backgroundColor: "rgba(212,175,55,0.08)" },
  promoIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.18)" },
  promoCode: { color: colors.gold, fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  promoDesc: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2, lineHeight: 15 },
  announceBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: colors.surface },
  announceIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.12)" },
  announceTitle: { color: "#fff", fontSize: 12, fontWeight: "600" },
  announceBody: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2, lineHeight: 15 },

  // SECTIONS
  section: { paddingHorizontal: 22, paddingTop: 40, paddingBottom: 8 },
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

  // POLICIES
  policyList: { marginTop: 16, gap: 8 },
  policyCard: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.surface },
  policyHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  policyIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.1)", borderWidth: 1, borderColor: "rgba(212,175,55,0.25)" },
  policyTitle: { color: "#fff", fontSize: 12, fontWeight: "500", flex: 1 },
  policyBody: { color: "rgba(255,255,255,0.65)", fontSize: 11, lineHeight: 17, marginTop: 10 },

  // FOOTER
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 4 },
  footerLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerLinkTxt: { color: colors.gold, fontSize: 12, fontWeight: "500" },
  driverLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18 },
  driverLinkTxt: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  footerTxt: { color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 16, textAlign: "center" },

  // STICKY CTA
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, backgroundColor: "rgba(5,5,5,0.96)", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  stickyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 999, backgroundColor: colors.gold },
  stickyBtnTxt: { color: "#000", fontSize: 14, fontWeight: "600" },
});
