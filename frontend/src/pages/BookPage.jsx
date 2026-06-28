// BookPage — focused booking landing page accessible at /book.
// Wired up for Google Business Profile "Book online" CTA + any other
// marketing link that wants to drop customers straight into the booking
// form without scrolling past the Home hero.

import { useEffect } from "react";

import Navbar from "@/components/Navbar";
import BookingForm from "@/components/BookingForm";
import Footer from "@/components/Footer";
import SeoStructuredData from "@/components/SeoStructuredData";
import PromoBanner from "@/components/PromoBanner";
import TrustBanner from "@/components/TrustBanner";

export default function BookPage() {
  useEffect(() => {
    document.title = "Book a Luxury Chauffeur | TuranEliteLimo — Bay Area";
  }, []);

  return (
    <main data-testid="book-page" className="bg-[#050505] text-white min-h-screen">
      <SeoStructuredData />
      <PromoBanner />
      <Navbar />

      {/* Compact hero — focused on the single CTA: book the trip. */}
      <section
        data-testid="book-page-hero"
        className="pt-28 pb-10 text-center border-b border-white/5"
      >
        <p className="text-[#D4AF37] text-[10px] uppercase tracking-[0.3em] mb-3">
          Book Your Trip
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl mb-4 leading-tight px-4">
          Reserve Your Luxury Chauffeur
        </h1>
        <p className="text-white/60 text-base max-w-2xl mx-auto px-6 leading-relaxed">
          Instant quotes for SFO / OAK / SJC airport transfers, hourly executive
          travel, weddings, and point-to-point trips across the Bay Area.
          Confirmed in under 2 minutes.
        </p>
      </section>

      <TrustBanner />
      <BookingForm />
      <Footer />
    </main>
  );
}
