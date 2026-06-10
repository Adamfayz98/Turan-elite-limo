import { useState, useEffect } from "react";
import {
  Smartphone, MapPin, Calendar, Clock, Users, ChevronRight, ChevronLeft,
  Phone, MessageSquare, Star, Settings, LogOut, User, CreditCard,
  Navigation, Car, Plus, ArrowRight, Check, Apple, Mail, Lock,
  Crown, Briefcase, Home as HomeIcon, History, Camera, ShieldCheck,
  TrendingUp, DollarSign, Award, Eye, EyeOff, Sparkles
} from "lucide-react";

/**
 * ============================================================================
 * TuranEliteLimo - Mobile App Mockups (Phone Frame Showcase)
 * ----------------------------------------------------------------------------
 * Static, click-through prototype for design approval. Renders all 12 screens
 * inside iPhone-sized phone frames so the user can review the visual language
 * before we commit to React Native build.
 *
 * Lives at: /preview/mobile (added in App.js)
 * ============================================================================
 */

const C = {
  bg: "#050505",
  surface: "#0C0C0C",
  surface2: "#141414",
  gold: "#D4AF37",
  goldHover: "#C9A961",
  textMuted: "rgba(255,255,255,0.55)",
  border: "rgba(255,255,255,0.08)",
};

const MAP_BG = "https://static.prod-images.emergentagent.com/jobs/1689fe63-929d-4e0f-9a68-ee41e3772b20/images/8fadd6148d386fdf9d2dfb3d804989709c16bb90eddcf9adec5ae5aebd807148.png";
const ABSTRACT_GOLD = "https://static.prod-images.emergentagent.com/jobs/1689fe63-929d-4e0f-9a68-ee41e3772b20/images/552a1c8656efc0533fd136ccd9396126f7b4d6677e70677000c2f04374d4d979.png";
const SEDAN = "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0";
const SUV = "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBibGFjayUyMHN1diUyMGNhcnxlbnwwfHx8fDE3NzkyNDUyODV8MA&ixlib=rb-4.1.0&q=85";
const FIRST_CLASS = "https://images.unsplash.com/photo-1609521247503-8de40462e427?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0";
const STRETCH = "https://images.unsplash.com/photo-1676107648535-931375db52e2?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0";
const DRIVER_PHOTO = "https://images.unsplash.com/photo-1603122101829-e56305b0a5f7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MjJ8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBjaGF1ZmZldXIlMjBzdWl0fGVufDB8fHx8MTc3OTI0NTI4NXww&ixlib=rb-4.1.0&q=85";
const LOGO_MARK = "/logo-mark.png";
const LOGO_FULL = "/logo-full.png";

// ---------- Phone frame wrapper ----------
function PhoneFrame({ title, label, children }) {
  return (
    <div className="flex flex-col items-center" data-testid={`phone-frame-${label}`}>
      <p className="text-[11px] uppercase tracking-[0.25em] text-white/40 mb-3">{title}</p>
      <div className="relative w-[300px] h-[640px] rounded-[44px] p-[10px] bg-gradient-to-b from-zinc-700 to-zinc-900 shadow-[0_30px_80px_-20px_rgba(212,175,55,0.15),0_10px_40px_-10px_rgba(0,0,0,0.8)]">
        <div className="relative w-full h-full rounded-[36px] overflow-hidden bg-black">
          {/* iOS-style notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-50 flex items-center justify-end pr-2">
            <div className="w-2 h-2 rounded-full bg-zinc-700" />
          </div>
          {/* status bar */}
          <div className="absolute top-0 inset-x-0 z-40 flex items-center justify-between px-6 pt-3 text-white text-[10px] font-medium tracking-wide">
            <span>9:41</span>
            <span className="opacity-0">.</span>
            <span className="flex items-center gap-1">
              <span>•••</span><span>›</span><span>100%</span>
            </span>
          </div>
          {/* screen content */}
          <div className="absolute inset-0 overflow-hidden">{children}</div>
          {/* home indicator */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-24 h-[3px] bg-white/60 rounded-full z-50" />
        </div>
      </div>
    </div>
  );
}

// ---------- Reusable UI atoms ----------
const goldBtn = "bg-[#D4AF37] text-black font-medium text-[13px] rounded-full px-5 py-3 w-full flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(212,175,55,0.25)]";
const outlineBtn = "bg-transparent border border-[#D4AF37]/50 text-[#D4AF37] font-medium text-[13px] rounded-full px-5 py-3 w-full flex items-center justify-center gap-2";
const inputCls = "bg-[#0C0C0C] border border-white/10 rounded-xl px-4 py-3 text-white text-[13px] placeholder-white/30 focus:border-[#D4AF37] focus:outline-none w-full";
const label = "text-[10px] uppercase tracking-[0.2em] text-white/45 mb-1.5 block font-medium";

function BottomNav({ active = "home", driver = false }) {
  const tabs = driver
    ? [
        { key: "trips", icon: Briefcase, label: "Trips" },
        { key: "stats", icon: TrendingUp, label: "Stats" },
        { key: "profile", icon: User, label: "Profile" },
      ]
    : [
        { key: "home", icon: HomeIcon, label: "Book" },
        { key: "history", icon: History, label: "Trips" },
        { key: "profile", icon: User, label: "Profile" },
      ];
  return (
    <div className="absolute inset-x-0 bottom-0 h-16 bg-black/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-4 pb-1 z-40">
      {tabs.map(t => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <div key={t.key} className="flex flex-col items-center gap-0.5">
            <Icon size={20} strokeWidth={1.6} color={isActive ? C.gold : "rgba(255,255,255,0.5)"} />
            <span className={`text-[9px] font-medium tracking-wide ${isActive ? "text-[#D4AF37]" : "text-white/50"}`}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ children, color = "gold" }) {
  const palette = {
    gold: "bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    gray: "bg-white/5 text-white/60 border-white/15",
    blue: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  };
  return (
    <span className={`text-[9px] uppercase tracking-[0.15em] font-medium px-2 py-1 rounded-full border ${palette[color]}`}>
      {children}
    </span>
  );
}

// ============================================================================
// SCREEN 1 — App Launch / Role Picker
// ============================================================================
function S_RolePicker() {
  return (
    <div className="absolute inset-0 bg-black">
      <img src={ABSTRACT_GOLD} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/95" />
      <div className="relative h-full flex flex-col items-center px-6 pt-14 pb-8">
        <img src={LOGO_MARK} alt="TuranEliteLimo" className="w-14 h-14 object-contain mb-3 drop-shadow-[0_0_20px_rgba(212,175,55,0.4)]" />
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={12} color={C.gold} />
          <span className="text-[9px] uppercase tracking-[0.3em] text-[#D4AF37]">Bay Area · NorCal</span>
        </div>
        <h1 className="font-serif text-[24px] leading-[1.15] text-white text-center mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>
          Welcome to<br /><span className="italic text-[#D4AF37]">TuranEliteLimo</span>
        </h1>
        <p className="text-white/55 text-[12px] text-center mt-3 leading-relaxed max-w-[220px]">
          Private chauffeured rides across San Francisco & beyond.
        </p>

        <div className="w-full mt-auto space-y-3">
          <p className={label + " text-center"}>How are you joining us today?</p>

          <button className="w-full rounded-2xl border border-[#D4AF37]/40 bg-[#D4AF37]/5 p-4 flex items-center gap-3 text-left">
            <div className="w-11 h-11 rounded-full bg-[#D4AF37]/15 flex items-center justify-center">
              <Crown size={20} color={C.gold} strokeWidth={1.6} />
            </div>
            <div className="flex-1">
              <p className="text-white text-[14px] font-medium">I'm a Rider</p>
              <p className="text-white/50 text-[11px]">Book a luxury chauffeur</p>
            </div>
            <ChevronRight size={18} color={C.gold} />
          </button>

          <button className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center gap-3 text-left">
            <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
              <Briefcase size={20} color="#fff" strokeWidth={1.6} />
            </div>
            <div className="flex-1">
              <p className="text-white text-[14px] font-medium">I'm a Driver</p>
              <p className="text-white/50 text-[11px]">Manage your trips</p>
            </div>
            <ChevronRight size={18} color="#fff" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN 2 — Rider Auth
// ============================================================================
function S_RiderAuth() {
  return (
    <div className="absolute inset-0 bg-[#050505] flex flex-col px-6 pt-14 pb-6">
      <div className="flex items-center justify-between mb-5">
        <button className="text-white/50 text-[12px] flex items-center gap-1"><ChevronLeft size={14} /> Back</button>
        <img src={LOGO_MARK} alt="" className="w-7 h-7 object-contain opacity-90" />
      </div>
      <h2 className="text-white text-[24px] leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
        Welcome <span className="italic text-[#D4AF37]">back.</span>
      </h2>
      <p className="text-white/50 text-[12px] mt-1.5">Sign in to manage your reservations.</p>

      <div className="flex gap-2 mt-6 mb-5">
        <button className="flex-1 py-2.5 rounded-full bg-[#D4AF37] text-black text-[11px] font-semibold uppercase tracking-wider">Sign In</button>
        <button className="flex-1 py-2.5 rounded-full text-white/55 text-[11px] font-medium uppercase tracking-wider">Create Account</button>
      </div>

      <div className="space-y-3">
        <div>
          <label className={label}>Email</label>
          <div className="relative">
            <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input type="email" className={inputCls + " pl-10"} placeholder="you@email.com" />
          </div>
        </div>
        <div>
          <label className={label}>Password</label>
          <div className="relative">
            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input type="password" className={inputCls + " pl-10 pr-10"} placeholder="••••••••" />
            <Eye size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          </div>
        </div>
        <button className="text-[#D4AF37] text-[11px] text-right block ml-auto">Forgot password?</button>
      </div>

      <button className={goldBtn + " mt-5"}>Continue <ArrowRight size={14} /></button>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[10px] uppercase tracking-wider text-white/35">or</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <button className="w-full py-3 rounded-full bg-white text-black text-[13px] font-medium flex items-center justify-center gap-2">
        <Apple size={16} /> Continue with Apple
      </button>
    </div>
  );
}

// ============================================================================
// SCREEN 3 — Rider Home / Booking
// ============================================================================
function S_RiderHome() {
  return (
    <div className="absolute inset-0 bg-[#050505]">
      <img src={MAP_BG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/95" />

      {/* Top bar */}
      <div className="absolute top-12 inset-x-0 px-5 z-30 flex items-center justify-between">
        <button className="w-10 h-10 rounded-full bg-black/70 backdrop-blur-md border border-white/10 flex items-center justify-center">
          <Settings size={16} color="#fff" strokeWidth={1.6} />
        </button>
        <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
          <img src={LOGO_MARK} alt="" className="w-4 h-4 object-contain" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37]">TuranElite</span>
        </div>
        <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center">
          <User size={14} color={C.gold} />
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="absolute bottom-16 inset-x-0 bg-[#0C0C0C]/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 p-5 z-30">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <h3 className="text-white text-[18px] leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
          Where to, <span className="italic text-[#D4AF37]">Mr. Turan?</span>
        </h3>
        <div className="mt-3.5 rounded-2xl border border-white/10 bg-[#141414] divide-y divide-white/5">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <input className="bg-transparent text-white text-[13px] flex-1 outline-none placeholder-white/40" placeholder="Pickup location" defaultValue="SFO Airport · Terminal 2" />
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-2 h-2 rounded-full bg-white/40" />
            <input className="bg-transparent text-white text-[13px] flex-1 outline-none placeholder-white/40" placeholder="Where to?" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button className="rounded-xl bg-[#141414] border border-white/8 px-3 py-2.5 flex items-center gap-2">
            <Calendar size={13} color={C.gold} strokeWidth={1.6} />
            <span className="text-white/85 text-[11px]">Tomorrow</span>
          </button>
          <button className="rounded-xl bg-[#141414] border border-white/8 px-3 py-2.5 flex items-center gap-2">
            <Clock size={13} color={C.gold} strokeWidth={1.6} />
            <span className="text-white/85 text-[11px]">9:30 AM</span>
          </button>
        </div>

        <button className={goldBtn + " mt-4"}>Continue <ArrowRight size={14} /></button>
      </div>

      <BottomNav active="home" />
    </div>
  );
}

// ============================================================================
// SCREEN 4 — Rider Vehicle Picker
// ============================================================================
function S_VehiclePicker() {
  const vehicles = [
    { name: "Executive Sedan", img: SEDAN, cap: "1-3", price: "$112", desc: "Mercedes E-Class · Cadillac XTS", selected: true },
    { name: "First Class", img: FIRST_CLASS, cap: "1-3", price: "$168", desc: "Mercedes S-Class · Genesis G90" },
    { name: "Luxury SUV", img: SUV, cap: "1-6", price: "$195", desc: "Cadillac Escalade · Lincoln Navigator" },
    { name: "Stretch Limo", img: STRETCH, cap: "1-10", price: "Quote", desc: "Lincoln · Chrysler 300" },
  ];
  return (
    <div className="absolute inset-0 bg-[#050505] flex flex-col">
      <div className="px-5 pt-12 pb-3 flex items-center justify-between">
        <button className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <ChevronLeft size={16} color="#fff" />
        </button>
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">Step 2 of 3</p>
        <span className="w-9" />
      </div>
      <h2 className="px-5 text-white text-[22px] leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
        Choose your <span className="italic text-[#D4AF37]">vehicle</span>
      </h2>
      <p className="px-5 text-white/50 text-[11px] mt-1 mb-3">SFO → Four Seasons SF · 17 mi</p>

      <div className="flex-1 overflow-y-auto px-5 pb-32 space-y-3">
        {vehicles.map((v, i) => (
          <div key={i} className={`rounded-2xl border ${v.selected ? "border-[#D4AF37] bg-[#D4AF37]/5" : "border-white/8 bg-[#0C0C0C]"} overflow-hidden`}>
            <div className="h-24 bg-zinc-900 overflow-hidden">
              <img src={v.img} alt={v.name} className="w-full h-full object-cover" />
            </div>
            <div className="p-3.5">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-white text-[14px] font-medium">{v.name}</h4>
                <span className={`text-[14px] font-semibold ${v.selected ? "text-[#D4AF37]" : "text-white"}`}>{v.price}</span>
              </div>
              <p className="text-white/45 text-[11px]">{v.desc}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-white/55 text-[10px]"><Users size={11} /> {v.cap} pax</span>
                {v.selected && <StatusBadge color="gold">Selected</StatusBadge>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black via-black/95 to-transparent">
        <button className={goldBtn}>Continue with Executive · $112 <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN 5 — Rider Quote + Pay
// ============================================================================
function S_QuotePay() {
  return (
    <div className="absolute inset-0 bg-[#050505] flex flex-col">
      <div className="px-5 pt-12 pb-2 flex items-center justify-between">
        <button className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <ChevronLeft size={16} color="#fff" />
        </button>
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">Confirm & Pay</p>
        <span className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-28">
        <h2 className="text-white text-[22px] leading-tight mt-2" style={{ fontFamily: "'Playfair Display', serif" }}>
          Review your <span className="italic text-[#D4AF37]">ride</span>
        </h2>

        {/* Itinerary card */}
        <div className="mt-4 rounded-2xl bg-[#0C0C0C] border border-white/8 p-4">
          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
              <span className="w-px flex-1 bg-white/15 my-1.5" />
              <span className="w-2 h-2 rounded-full bg-white/50" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className={label + " mb-0.5"}>Pickup</p>
                <p className="text-white text-[12px]">SFO Airport · Terminal 2</p>
                <p className="text-white/45 text-[10px]">Tomorrow · 9:30 AM</p>
              </div>
              <div>
                <p className={label + " mb-0.5"}>Drop-off</p>
                <p className="text-white text-[12px]">Four Seasons San Francisco</p>
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle */}
        <div className="mt-3 rounded-2xl bg-[#0C0C0C] border border-white/8 p-3 flex items-center gap-3">
          <img src={SEDAN} className="w-14 h-14 rounded-xl object-cover" />
          <div className="flex-1">
            <p className="text-white text-[13px] font-medium">Executive Sedan</p>
            <p className="text-white/45 text-[10px]">Meet & Greet included</p>
          </div>
          <ChevronRight size={14} color="rgba(255,255,255,0.4)" />
        </div>

        {/* Promo */}
        <div className="mt-3 rounded-2xl bg-[#0C0C0C] border border-dashed border-[#D4AF37]/30 p-3 flex items-center gap-3">
          <Sparkles size={15} color={C.gold} />
          <input className="bg-transparent text-white text-[12px] flex-1 outline-none placeholder-white/40" placeholder="Have a promo code?" />
          <button className="text-[#D4AF37] text-[11px] font-medium">Apply</button>
        </div>

        {/* Price breakdown */}
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-[12px]"><span className="text-white/55">Base fare</span><span className="text-white">$95.00</span></div>
          <div className="flex justify-between text-[12px]"><span className="text-white/55">Meet & Greet</span><span className="text-white">$15.00</span></div>
          <div className="flex justify-between text-[12px]"><span className="text-white/55">Service fee</span><span className="text-white">$2.00</span></div>
          <div className="border-t border-white/10 pt-2 flex justify-between items-center">
            <span className="text-white text-[13px] font-medium">Total</span>
            <span className="text-[#D4AF37] text-[20px] font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>$112.00</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black via-black/95 to-transparent space-y-2">
        <button className="w-full py-3 rounded-full bg-white text-black text-[13px] font-semibold flex items-center justify-center gap-2">
          <Apple size={15} /> Pay with Apple Pay
        </button>
        <button className={outlineBtn}>
          <CreditCard size={14} /> Pay with Card
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN 6 — Rider Active Trip / Live Tracking
// ============================================================================
function S_ActiveTrip() {
  return (
    <div className="absolute inset-0 bg-[#050505]">
      <img src={MAP_BG} alt="" className="absolute inset-0 w-full h-full object-cover" />

      {/* Top ETA pill */}
      <div className="absolute top-12 inset-x-0 z-30 flex justify-center px-5">
        <div className="bg-black/80 backdrop-blur-md border border-[#D4AF37]/30 rounded-full pl-2 pr-5 py-1.5 flex items-center gap-2 shadow-[0_0_30px_rgba(212,175,55,0.2)]">
          <img src={LOGO_MARK} alt="" className="w-6 h-6 object-contain" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white text-[11px]">Driver arriving in</span>
          <span className="text-[#D4AF37] text-[14px] font-semibold">4 min</span>
        </div>
      </div>

      {/* Animated car icon pin */}
      <div className="absolute left-1/2 top-[38%] -translate-x-1/2 z-20">
        <div className="relative">
          <div className="absolute inset-0 w-12 h-12 rounded-full bg-[#D4AF37]/30 blur-xl" />
          <div className="relative w-10 h-10 rounded-full bg-[#D4AF37] flex items-center justify-center shadow-[0_0_25px_rgba(212,175,55,0.6)]">
            <Car size={18} color="#000" strokeWidth={2} />
          </div>
        </div>
      </div>

      {/* Driver bottom sheet */}
      <div className="absolute bottom-0 inset-x-0 bg-[#0C0C0C]/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 z-40">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-3 mb-4" />
        <div className="px-5 pb-6">
          <div className="flex items-center gap-3">
            <img src={DRIVER_PHOTO} className="w-14 h-14 rounded-full object-cover border-2 border-[#D4AF37]/50" />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-white text-[14px] font-medium">Marcus T.</p>
                <ShieldCheck size={12} color={C.gold} />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1 text-white/65 text-[11px]"><Star size={10} color={C.gold} fill={C.gold} /> 4.97</span>
                <span className="text-white/30 text-[10px]">·</span>
                <span className="text-white/55 text-[11px]">1,847 rides</span>
              </div>
              <p className="text-white/45 text-[10px] mt-0.5">Black Mercedes E-Class · 8BHK429</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button className="rounded-full bg-[#D4AF37] text-black py-2.5 text-[12px] font-semibold flex items-center justify-center gap-2">
              <Phone size={13} /> Call
            </button>
            <button className="rounded-full border border-[#D4AF37]/50 text-[#D4AF37] py-2.5 text-[12px] font-medium flex items-center justify-center gap-2">
              <MessageSquare size={13} /> Message
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-white/8 space-y-2">
            <div className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5" />
              <div className="flex-1">
                <p className="text-white/45 text-[10px] uppercase tracking-wider">Pickup</p>
                <p className="text-white text-[12px]">SFO · Terminal 2</p>
              </div>
              <span className="text-[#D4AF37] text-[10px]">9:34 AM</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-white/40 mt-1.5" />
              <div className="flex-1">
                <p className="text-white/45 text-[10px] uppercase tracking-wider">Drop-off</p>
                <p className="text-white text-[12px]">Four Seasons SF</p>
              </div>
              <span className="text-white/45 text-[10px]">~10:05 AM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN 7 — Rider Trip History
// ============================================================================
function S_TripHistory() {
  const trips = [
    { date: "Yesterday", from: "Home", to: "SFO Terminal 1", price: "$98", v: "Sedan", status: "Completed" },
    { date: "Mar 12", from: "Salesforce Tower", to: "Napa Valley", price: "$420", v: "SUV", status: "Completed" },
    { date: "Mar 5", from: "SFO Int'l", to: "Hotel Vitale", price: "$112", v: "First Class", status: "Completed" },
    { date: "Feb 28", from: "Home", to: "Chase Center", price: "$78", v: "Sedan", status: "Completed" },
  ];
  return (
    <div className="absolute inset-0 bg-[#050505] flex flex-col">
      <div className="px-5 pt-12 pb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Your journeys</p>
        <h2 className="text-white text-[24px] leading-tight mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>
          Trip <span className="italic text-[#D4AF37]">history</span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-20 space-y-3">
        {trips.map((t, i) => (
          <div key={i} className="rounded-2xl bg-[#0C0C0C] border border-white/8 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-white/50">{t.date}</span>
              <StatusBadge color="green">{t.status}</StatusBadge>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                <span className="w-px flex-1 bg-white/15 my-1" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              </div>
              <div className="flex-1">
                <p className="text-white text-[12px]">{t.from}</p>
                <p className="text-white text-[12px] mt-2">{t.to}</p>
              </div>
              <div className="text-right">
                <p className="text-[#D4AF37] text-[14px] font-semibold">{t.price}</p>
                <p className="text-white/40 text-[10px] mt-0.5">{t.v}</p>
              </div>
            </div>
            <button className="mt-3 w-full text-[11px] text-[#D4AF37] border-t border-white/8 pt-3 flex items-center justify-center gap-1.5">
              Book again <ArrowRight size={11} />
            </button>
          </div>
        ))}
      </div>

      <BottomNav active="history" />
    </div>
  );
}

// ============================================================================
// SCREEN 8 — Rider Profile
// ============================================================================
function S_RiderProfile() {
  const rows = [
    { icon: User, label: "Personal Information" },
    { icon: MapPin, label: "Saved Addresses", badge: "3" },
    { icon: CreditCard, label: "Payment Methods" },
    { icon: Sparkles, label: "Promo Codes" },
    { icon: Settings, label: "Preferences" },
    { icon: ShieldCheck, label: "Privacy & Security" },
  ];
  return (
    <div className="absolute inset-0 bg-[#050505] flex flex-col">
      <div className="relative h-44 overflow-hidden">
        <img src={ABSTRACT_GOLD} className="absolute inset-0 w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-[#050505]" />
        <img src={LOGO_MARK} alt="" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 object-contain opacity-[0.08]" />
        <div className="relative h-full flex flex-col items-center justify-end pb-5">
          <div className="w-20 h-20 rounded-full bg-[#D4AF37] flex items-center justify-center text-black text-[26px] font-semibold mb-2 shadow-[0_0_30px_rgba(212,175,55,0.4)]" style={{ fontFamily: "'Playfair Display', serif" }}>T</div>
          <p className="text-white text-[15px] font-medium">Turan Aliyev</p>
          <p className="text-white/45 text-[11px] flex items-center gap-1.5">
            <Crown size={10} color={C.gold} /> Elite Member · 12 rides
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-20">
        <div className="rounded-2xl bg-[#0C0C0C] border border-white/8 divide-y divide-white/5">
          {rows.map((r, i) => {
            const Icon = r.icon;
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Icon size={16} color={C.gold} strokeWidth={1.6} />
                <span className="text-white text-[12.5px] flex-1">{r.label}</span>
                {r.badge && <span className="text-[10px] text-white/45 mr-1">{r.badge}</span>}
                <ChevronRight size={14} color="rgba(255,255,255,0.4)" />
              </div>
            );
          })}
        </div>
        <button className="w-full mt-4 py-3 rounded-2xl border border-red-500/30 text-red-400 text-[12px] flex items-center justify-center gap-2">
          <LogOut size={13} /> Sign Out
        </button>
      </div>

      <BottomNav active="profile" />
    </div>
  );
}

// ============================================================================
// SCREEN 9 — Driver Auth
// ============================================================================
function S_DriverAuth() {
  return (
    <div className="absolute inset-0 bg-[#050505] flex flex-col">
      <div className="px-6 pt-14 pb-6">
        <div className="flex items-center justify-between mb-5">
          <button className="text-white/50 text-[12px] flex items-center gap-1"><ChevronLeft size={14} /> Back</button>
          <img src={LOGO_MARK} alt="" className="w-7 h-7 object-contain opacity-90" />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 mb-3">
          <Briefcase size={11} color={C.gold} />
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37]">Chauffeur Portal</span>
        </div>
        <h2 className="text-white text-[24px] leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
          Behind the <span className="italic text-[#D4AF37]">wheel.</span>
        </h2>
        <p className="text-white/50 text-[12px] mt-1.5">Sign in to view your assigned trips.</p>
      </div>

      <div className="px-6 space-y-3 flex-1">
        <div>
          <label className={label}>Driver ID or Email</label>
          <div className="relative">
            <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input type="text" className={inputCls + " pl-10"} placeholder="marcus.t@turanlimo.com" />
          </div>
        </div>
        <div>
          <label className={label}>Password</label>
          <div className="relative">
            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input type="password" className={inputCls + " pl-10"} placeholder="••••••••" />
          </div>
        </div>

        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 flex gap-2.5 mt-4">
          <ShieldCheck size={14} color={C.gold} className="flex-shrink-0 mt-0.5" />
          <p className="text-white/65 text-[10.5px] leading-relaxed">
            Driver accounts are issued by dispatch. Contact <span className="text-[#D4AF37]">dispatch@turanelitelimo.com</span> if you don't have credentials.
          </p>
        </div>

        <button className={goldBtn + " mt-4"}>Sign In to Drive <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN 10 — Driver Trip Queue
// ============================================================================
function S_DriverQueue() {
  const trips = [
    { time: "9:30 AM", date: "TODAY", from: "SFO · T2", to: "Four Seasons SF", customer: "Sarah K.", status: "Next up", color: "gold", v: "Executive Sedan", pax: 2 },
    { time: "2:15 PM", date: "TODAY", from: "Salesforce Tower", to: "OAK Airport", customer: "Brian M.", status: "Upcoming", color: "gray", v: "First Class", pax: 1 },
    { time: "7:00 PM", date: "TODAY", from: "Atherton", to: "Napa - Auberge", customer: "Linda H.", status: "Upcoming", color: "gray", v: "Luxury SUV", pax: 4 },
    { time: "8:00 AM", date: "TOMORROW", from: "Hotel Vitale", to: "SFO · T1", customer: "Jordan W.", status: "Upcoming", color: "gray", v: "Sedan", pax: 1 },
  ];
  return (
    <div className="absolute inset-0 bg-[#050505] flex flex-col">
      <div className="px-5 pt-12 pb-4 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Good morning, Marcus</p>
          <h2 className="text-white text-[22px] leading-tight mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>
            <span className="italic text-[#D4AF37]">4</span> trips today
          </h2>
        </div>
        <div className="text-right">
          <p className="text-white/45 text-[10px] uppercase tracking-wider">Earned</p>
          <p className="text-[#D4AF37] text-[15px] font-semibold">$0 / $580</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-20 space-y-3">
        {trips.map((t, i) => (
          <div key={i} className={`rounded-2xl border ${i === 0 ? "border-[#D4AF37]/40 bg-[#D4AF37]/5" : "border-white/8 bg-[#0C0C0C]"} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[#D4AF37] text-[14px] font-semibold">{t.time}</span>
                <span className="text-[9px] uppercase tracking-wider text-white/40">{t.date}</span>
              </div>
              <StatusBadge color={t.color}>{t.status}</StatusBadge>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                <span className="w-px flex-1 bg-white/15 my-1" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              </div>
              <div className="flex-1">
                <p className="text-white text-[12px]">{t.from}</p>
                <p className="text-white text-[12px] mt-2">{t.to}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white/8 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <User size={11} color="rgba(255,255,255,0.55)" />
                <span className="text-white/65 text-[11px]">{t.customer} · {t.pax} pax</span>
              </div>
              <span className="text-white/45 text-[10px]">{t.v}</span>
            </div>
            {i === 0 && (
              <button className={goldBtn + " mt-3 py-2.5 text-[12px]"}>Start Trip <ArrowRight size={13} /></button>
            )}
          </div>
        ))}
      </div>

      <BottomNav active="trips" driver />
    </div>
  );
}

// ============================================================================
// SCREEN 11 — Driver Active Trip
// ============================================================================
function S_DriverActiveTrip() {
  return (
    <div className="absolute inset-0 bg-[#050505] flex flex-col">
      <div className="relative h-64 overflow-hidden">
        <img src={MAP_BG} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute top-12 inset-x-0 px-5 flex justify-between">
          <button className="w-9 h-9 rounded-full bg-black/70 backdrop-blur border border-white/10 flex items-center justify-center">
            <ChevronLeft size={16} color="#fff" />
          </button>
          <div className="bg-black/80 backdrop-blur-md rounded-full px-3.5 py-1.5 border border-[#D4AF37]/30">
            <span className="text-[#D4AF37] text-[11px] font-medium">En route to pickup</span>
          </div>
          <button className="w-9 h-9 rounded-full bg-[#D4AF37] flex items-center justify-center">
            <Navigation size={14} color="#000" />
          </button>
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md rounded-2xl px-4 py-2.5 flex items-center gap-3 border border-white/10">
          <Clock size={13} color={C.gold} />
          <span className="text-white text-[12px]">12 min · 4.3 mi</span>
        </div>
      </div>

      <div className="flex-1 px-5 pt-4 pb-6 -mt-4 bg-[#050505] rounded-t-3xl relative z-10">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

        <div className="rounded-2xl bg-[#0C0C0C] border border-white/8 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-[#D4AF37]/15 flex items-center justify-center">
              <User size={20} color={C.gold} />
            </div>
            <div className="flex-1">
              <p className="text-white text-[14px] font-medium">Sarah K.</p>
              <p className="text-white/50 text-[11px]">2 passengers · Executive Sedan</p>
            </div>
            <StatusBadge color="gold">VIP</StatusBadge>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-full bg-[#D4AF37] text-black py-2.5 text-[12px] font-semibold flex items-center justify-center gap-2">
              <Phone size={13} /> Call
            </button>
            <button className="rounded-full border border-[#D4AF37]/50 text-[#D4AF37] py-2.5 text-[12px] font-medium flex items-center justify-center gap-2">
              <MessageSquare size={13} /> Message
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-2xl bg-[#0C0C0C] border border-white/8 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] mt-1.5" />
            <div className="flex-1">
              <p className={label + " mb-0.5"}>Pickup</p>
              <p className="text-white text-[12px]">SFO Airport · Terminal 2 · Door 4</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-white/40 mt-1.5" />
            <div className="flex-1">
              <p className={label + " mb-0.5"}>Drop-off</p>
              <p className="text-white text-[12px]">Four Seasons San Francisco</p>
            </div>
          </div>
          <div className="border-t border-white/8 pt-3">
            <p className={label + " mb-1"}>Notes</p>
            <p className="text-white/75 text-[11px] italic">"Meet at baggage claim with name sign please."</p>
          </div>
        </div>

        <button className={goldBtn + " mt-4"}>I've arrived at pickup <Check size={14} /></button>
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN 12 — Driver Profile & Stats
// ============================================================================
function S_DriverProfile() {
  return (
    <div className="absolute inset-0 bg-[#050505] flex flex-col">
      <div className="relative h-52 overflow-hidden">
        <img src={ABSTRACT_GOLD} className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-[#050505]" />
        <div className="relative h-full flex flex-col items-center justify-end pb-5">
          <div className="relative">
            <img src={DRIVER_PHOTO} className="w-20 h-20 rounded-full object-cover border-2 border-[#D4AF37]" />
            <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#D4AF37] flex items-center justify-center border-2 border-[#050505]">
              <Camera size={12} color="#000" />
            </button>
          </div>
          <p className="text-white text-[15px] font-medium mt-2.5">Marcus Thompson</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Star size={11} color={C.gold} fill={C.gold} />
            <span className="text-[#D4AF37] text-[11px] font-medium">4.97</span>
            <span className="text-white/40 text-[10px]">·</span>
            <span className="text-white/55 text-[11px] flex items-center gap-1">
              <img src={LOGO_MARK} alt="" className="w-3 h-3 object-contain" /> TuranElite Chauffeur since 2021
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 pb-20 overflow-y-auto">
        <p className={label}>This Week</p>
        <div className="grid grid-cols-2 gap-2.5 mt-2">
          <div className="rounded-2xl bg-[#0C0C0C] border border-white/8 p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Car size={13} color={C.gold} />
              <span className="text-white/55 text-[10px] uppercase tracking-wider">Trips</span>
            </div>
            <p className="text-white text-[22px] font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>28</p>
            <p className="text-emerald-400 text-[10px] mt-0.5">↑ 12% vs last week</p>
          </div>
          <div className="rounded-2xl bg-[#0C0C0C] border border-white/8 p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <DollarSign size={13} color={C.gold} />
              <span className="text-white/55 text-[10px] uppercase tracking-wider">Earnings</span>
            </div>
            <p className="text-[#D4AF37] text-[22px] font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>$2,840</p>
            <p className="text-emerald-400 text-[10px] mt-0.5">↑ $310</p>
          </div>
          <div className="rounded-2xl bg-[#0C0C0C] border border-white/8 p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Star size={13} color={C.gold} />
              <span className="text-white/55 text-[10px] uppercase tracking-wider">Rating</span>
            </div>
            <p className="text-white text-[22px] font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>4.97</p>
            <p className="text-white/45 text-[10px] mt-0.5">62 ratings this week</p>
          </div>
          <div className="rounded-2xl bg-[#0C0C0C] border border-white/8 p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Award size={13} color={C.gold} />
              <span className="text-white/55 text-[10px] uppercase tracking-wider">Streak</span>
            </div>
            <p className="text-white text-[22px] font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>14 days</p>
            <p className="text-white/45 text-[10px] mt-0.5">Top performer</p>
          </div>
        </div>

        <p className={label + " mt-4"}>Account</p>
        <div className="mt-2 rounded-2xl bg-[#0C0C0C] border border-white/8 divide-y divide-white/5">
          {[
            { icon: User, label: "Personal Info" },
            { icon: Car, label: "Vehicle & License" },
            { icon: DollarSign, label: "Payout Settings" },
            { icon: Settings, label: "Preferences" },
          ].map((r, i) => {
            const Icon = r.icon;
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Icon size={15} color={C.gold} strokeWidth={1.6} />
                <span className="text-white text-[12.5px] flex-1">{r.label}</span>
                <ChevronRight size={13} color="rgba(255,255,255,0.4)" />
              </div>
            );
          })}
        </div>
      </div>

      <BottomNav active="profile" driver />
    </div>
  );
}

// ============================================================================
// Main showcase page
// ============================================================================
const SCREENS = [
  { id: "launch", title: "01 · Launch / Role Picker", comp: S_RolePicker, note: "Cinematic first impression. Sets premium tone." },
  { id: "rider-auth", title: "02 · Rider Sign In", comp: S_RiderAuth, note: "Email + password, with Apple Sign-In." },
  { id: "rider-home", title: "03 · Rider Home (Book)", comp: S_RiderHome, note: "Map background, sheet asks 'Where to?'" },
  { id: "vehicle", title: "04 · Vehicle Picker", comp: S_VehiclePicker, note: "Cards with real fleet photos & pricing." },
  { id: "pay", title: "05 · Review & Pay", comp: S_QuotePay, note: "Apple Pay + card. Promo code surface." },
  { id: "active", title: "06 · Active Trip (Live)", comp: S_ActiveTrip, note: "★ The hero screen. Live driver location + call/text." },
  { id: "history", title: "07 · Trip History", comp: S_TripHistory, note: "Past trips with 'Book again' shortcut." },
  { id: "profile", title: "08 · Rider Profile", comp: S_RiderProfile, note: "Settings, saved addresses, payment methods." },
  { id: "driver-auth", title: "09 · Driver Sign In", comp: S_DriverAuth, note: "Distinct 'Chauffeur Portal' framing." },
  { id: "driver-queue", title: "10 · Driver Trip Queue", comp: S_DriverQueue, note: "Today's trips with 'Start Trip' CTA." },
  { id: "driver-active", title: "11 · Driver Active Trip", comp: S_DriverActiveTrip, note: "Navigate, call, message, status updates." },
  { id: "driver-profile", title: "12 · Driver Profile & Stats", comp: S_DriverProfile, note: "Photo upload, weekly stats, earnings." },
];

export default function MobileMockup() {
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    document.title = "TuranEliteLimo — Mobile App Mockups";
    // Inject Playfair Display
    if (!document.querySelector('link[data-playfair]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap";
      link.setAttribute("data-playfair", "1");
      document.head.appendChild(link);
    }
  }, []);

  if (focus !== null) {
    const screen = SCREENS[focus];
    const Comp = screen.comp;
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#050505] to-[#0a0a0a] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md flex items-center justify-between mb-5">
          <button onClick={() => setFocus(focus > 0 ? focus - 1 : SCREENS.length - 1)} className="text-white/55 text-[12px] flex items-center gap-1 hover:text-[#D4AF37]" data-testid="prev-screen-btn">
            <ChevronLeft size={15} /> Prev
          </button>
          <button onClick={() => setFocus(null)} className="text-[#D4AF37] text-[12px]" data-testid="back-to-gallery-btn">View all 12 ←</button>
          <button onClick={() => setFocus(focus < SCREENS.length - 1 ? focus + 1 : 0)} className="text-white/55 text-[12px] flex items-center gap-1 hover:text-[#D4AF37]" data-testid="next-screen-btn">
            Next <ChevronRight size={15} />
          </button>
        </div>
        <PhoneFrame title={screen.title} label={screen.id}>
          <Comp />
        </PhoneFrame>
        <p className="text-white/55 text-[12px] mt-5 text-center max-w-xs">{screen.note}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#050505] to-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/5 backdrop-blur-md sticky top-0 z-50 bg-[#050505]/80">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone size={14} color={C.gold} />
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37]">Design Review</span>
            </div>
            <h1 className="text-white text-xl mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>
              TuranEliteLimo · <span className="italic text-[#D4AF37]">Mobile App</span>
            </h1>
          </div>
          <a href="/" className="text-white/55 text-[12px] hover:text-white">← turanelitelimo.com</a>
        </div>
      </div>

      {/* Intro */}
      <div className="max-w-3xl mx-auto px-6 py-10 text-center">
        <p className="text-white/70 text-[14px] leading-relaxed">
          Tap any screen below to see it full-size. <span className="text-[#D4AF37]">12 screens · rider + driver flows.</span> Designed to mirror your website's dark/gold luxury feel, adapted for native mobile patterns (bottom sheets, swipe gestures, thumb-zone navigation).
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 text-[10px] uppercase tracking-wider">Static mockups</span>
          <span className="px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] uppercase tracking-wider">Pre-build approval</span>
        </div>
      </div>

      {/* Phone grid */}
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
          {SCREENS.map((s, i) => {
            const Comp = s.comp;
            return (
              <button
                key={s.id}
                onClick={() => setFocus(i)}
                className="group cursor-pointer focus:outline-none"
                data-testid={`gallery-${s.id}`}
              >
                <div className="transform transition-transform duration-300 group-hover:-translate-y-2 group-hover:scale-[1.02]">
                  <PhoneFrame title={s.title} label={s.id}>
                    <Comp />
                  </PhoneFrame>
                </div>
                <p className="text-white/50 group-hover:text-white/80 text-[11px] mt-4 text-center max-w-[280px] mx-auto transition-colors leading-relaxed">{s.note}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/5 bg-black/40 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <h3 className="text-white text-xl" style={{ fontFamily: "'Playfair Display', serif" }}>Ready to build this?</h3>
          <p className="text-white/55 text-[13px] mt-2 max-w-md mx-auto">If the design feels right, we'll port these screens to React Native (Expo) and ship to TestFlight + Play Store internal testing in ~2-3 weeks.</p>
        </div>
      </div>
    </div>
  );
}
