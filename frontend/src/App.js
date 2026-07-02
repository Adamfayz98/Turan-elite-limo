import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import Home from "@/pages/Home";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import PayBooking from "@/pages/PayBooking";
import ManageBooking from "@/pages/ManageBooking";
import DriverPortal from "@/pages/DriverPortal";
import PostTrip from "@/pages/PostTrip";
import Announcement from "@/pages/Announcement";
import MobileMockup from "@/pages/MobileMockup";
import ResetPassword from "@/pages/ResetPassword";
import DriverResetPassword from "@/pages/DriverResetPassword";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import AccountDeletion from "@/pages/AccountDeletion";
import AppDownload from "@/pages/AppDownload";
import TermsOfService from "@/pages/TermsOfService";
import WorldCup2026 from "@/pages/WorldCup2026";
import AirportLanding from "@/pages/AirportLanding";
import WeddingLanding from "@/pages/WeddingLanding";
import WineTourLanding from "@/pages/WineTourLanding";
import CorporateLanding from "@/pages/CorporateLanding";
import PartyBusLanding from "@/pages/PartyBusLanding";
import MotorCoachLanding from "@/pages/MotorCoachLanding";
import MiniCoachLanding from "@/pages/MiniCoachLanding";
import CasinoLanding from "@/pages/CasinoLanding";
import QuoteOfferConfirm from "@/pages/QuoteOfferConfirm";
import BookPage from "@/pages/BookPage";
import QuotePage from "@/pages/QuotePage";
import ReferralRedirect from "@/pages/ReferralRedirect";
import MyReferrals from "@/pages/MyReferrals";
import GoogleSiteTag from "@/components/GoogleSiteTag";
import FloatingChatWidget from "@/components/FloatingChatWidget";
import { useLocation } from "react-router-dom";
import { captureUtm } from "@/lib/utm";

function App() {
  useEffect(() => {
    // Capture UTM / gclid params on the FIRST visit (first-touch attribution,
    // persisted in localStorage for 90 days). Forms read this on submit so we
    // can surface ad source in the admin + weekly digest even if the customer
    // books weeks later from a bookmark.
    captureUtm();

    // Only set the default site title on the home route. Other routes
    // (landing pages, admin, etc.) own their own document.title.
    if (window.location.pathname === "/") {
      document.title = "TuranEliteLimo — Luxury Chauffeur Service | Bay Area & Northern California";
    }
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="App dark bg-[#050505] text-white min-h-screen">
      <GoogleSiteTag />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pay/:bookingId" element={<PayBooking />} />
          <Route path="/thank-you" element={<PayBooking />} />
          <Route path="/manage/:token" element={<ManageBooking />} />
          <Route path="/driver/:token" element={<DriverPortal />} />
          <Route path="/post-trip/:token" element={<PostTrip />} />
          <Route path="/news/:slug" element={<Announcement />} />
          <Route path="/preview/mobile" element={<MobileMockup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/driver-reset-password" element={<DriverResetPassword />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/account-deletion" element={<AccountDeletion />} />
          <Route path="/delete-account" element={<AccountDeletion />} />
          <Route path="/app" element={<AppDownload />} />
          <Route path="/download" element={<AppDownload />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/world-cup-2026" element={<WorldCup2026 />} />
          <Route path="/worldcup" element={<WorldCup2026 />} />
          <Route path="/levis-stadium" element={<WorldCup2026 />} />
          <Route path="/levis-stadium-transportation" element={<WorldCup2026 />} />
          <Route path="/airport" element={<AirportLanding />} />
          <Route path="/airport-transfer" element={<AirportLanding />} />
          <Route path="/sfo-airport-transfer" element={<AirportLanding />} />
          <Route path="/oak-airport-transfer" element={<AirportLanding />} />
          <Route path="/sjc-airport-transfer" element={<AirportLanding />} />
          <Route path="/wedding" element={<WeddingLanding />} />
          <Route path="/wedding-limo" element={<WeddingLanding />} />
          <Route path="/wedding-chauffeur" element={<WeddingLanding />} />
          <Route path="/wine-tour" element={<WineTourLanding />} />
          <Route path="/napa-tour" element={<WineTourLanding />} />
          <Route path="/sonoma-tour" element={<WineTourLanding />} />
          <Route path="/wine-country" element={<WineTourLanding />} />
          <Route path="/corporate" element={<CorporateLanding />} />
          <Route path="/corporate-chauffeur" element={<CorporateLanding />} />
          <Route path="/silicon-valley-chauffeur" element={<CorporateLanding />} />
          <Route path="/party-bus" element={<PartyBusLanding />} />
          <Route path="/party-bus-rental" element={<PartyBusLanding />} />
          <Route path="/party-bus-san-francisco" element={<PartyBusLanding />} />
          <Route path="/party-bus-bay-area" element={<PartyBusLanding />} />
          <Route path="/limo-bus" element={<PartyBusLanding />} />
          {/* Motor Coach — 40–56 passenger charter bus */}
          <Route path="/motor-coach" element={<MotorCoachLanding />} />
          <Route path="/motor-coach-rental" element={<MotorCoachLanding />} />
          <Route path="/motor-coach-bay-area" element={<MotorCoachLanding />} />
          <Route path="/charter-bus" element={<MotorCoachLanding />} />
          <Route path="/charter-bus-rental" element={<MotorCoachLanding />} />
          <Route path="/charter-bus-san-francisco" element={<MotorCoachLanding />} />
          <Route path="/56-passenger-bus" element={<MotorCoachLanding />} />
          <Route path="/coach-bus-rental" element={<MotorCoachLanding />} />
          {/* Mini Coach — 24–35 passenger */}
          <Route path="/mini-coach" element={<MiniCoachLanding />} />
          <Route path="/mini-coach-rental" element={<MiniCoachLanding />} />
          <Route path="/mini-bus" element={<MiniCoachLanding />} />
          <Route path="/mini-bus-rental" element={<MiniCoachLanding />} />
          <Route path="/24-passenger-bus" element={<MiniCoachLanding />} />
          <Route path="/28-passenger-bus" element={<MiniCoachLanding />} />
          <Route path="/35-passenger-bus" element={<MiniCoachLanding />} />
          <Route path="/mini-coach-bay-area" element={<MiniCoachLanding />} />
          {/* Casino transportation */}
          <Route path="/casino" element={<CasinoLanding />} />
          <Route path="/casino-transportation" element={<CasinoLanding />} />
          <Route path="/casino-shuttle" element={<CasinoLanding />} />
          <Route path="/casino-bus" element={<CasinoLanding />} />
          <Route path="/bay-area-casino" element={<CasinoLanding />} />
          <Route path="/graton-casino-shuttle" element={<CasinoLanding />} />
          <Route path="/thunder-valley-shuttle" element={<CasinoLanding />} />
          <Route path="/cache-creek-shuttle" element={<CasinoLanding />} />
          <Route path="/reno-bus-trip" element={<CasinoLanding />} />
          <Route path="/tahoe-casino-transportation" element={<CasinoLanding />} />
          <Route path="/quote/:token" element={<QuoteOfferConfirm />} />
          {/* Dedicated landing pages for Google Business Profile "Book online"
              and "Request quote" CTAs. Both reuse BookingForm but wrap it in
              focused copy + a unique <title>. Keep these ABOVE generic catch-
              alls so the exact-match `/book` and `/quote` don't get swallowed. */}
          <Route path="/book" element={<BookPage />} />
          <Route path="/quote" element={<QuotePage />} />
          <Route path="/r/:code" element={<ReferralRedirect />} />
          <Route path="/refer" element={<MyReferrals />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
        <ConditionalChatWidget />
      </BrowserRouter>
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: "#111111",
            border: "1px solid #27272A",
            color: "#fff",
          },
        }}
      />
    </div>
  );
}

export default App;

/**
 * Hide the public AI chat widget on admin / driver / payment / quote-confirm
 * pages — those are authenticated or transactional flows where a marketing
 * concierge bubble is noise. Everywhere else (home, landing pages, etc.) the
 * widget appears at the bottom-right.
 */
function ConditionalChatWidget() {
  const location = useLocation();
  const hidden =
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/driver") ||
    location.pathname.startsWith("/pay") ||
    location.pathname.startsWith("/manage") ||
    // Hide on `/quote/:token` confirmation pages (transactional flow) but NOT
    // on the bare `/quote` landing page where we WANT the widget to help
    // customers convert. The trailing slash makes the distinction.
    location.pathname.startsWith("/quote/") ||
    location.pathname.startsWith("/post-trip");
  if (hidden) return null;
  return <FloatingChatWidget />;
}
