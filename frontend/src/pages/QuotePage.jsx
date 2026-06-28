// QuotePage — focused custom-quote landing page accessible at /quote.
// Wired up for Google Business Profile "Request quote" CTA. The booking
// form already handles both instant-quote vehicles AND call-only vehicles
// (which trigger the QuoteRequestDialog automatically), so we reuse it
// with quote-focused copy to set the right expectation.

import { useEffect } from "react";

import Navbar from "@/components/Navbar";
import BookingForm from "@/components/BookingForm";
import Footer from "@/components/Footer";
import SeoStructuredData from "@/components/SeoStructuredData";

export default function QuotePage() {
  useEffect(() => {
    document.title = "Request a Custom Quote | TuranEliteLimo — Bay Area";
  }, []);

  return (
    <main data-testid="quote-page" className="bg-[#050505] text-white min-h-screen">
      <SeoStructuredData />
      <Navbar />

      {/* Compact hero — sets the expectation: not always instant, sometimes
          custom (e.g. multi-stop wine tours, party buses, stretch limos). */}
      <section
        data-testid="quote-page-hero"
        className="pt-28 pb-10 text-center border-b border-white/5"
      >
        <p className="text-[#D4AF37] text-[10px] uppercase tracking-[0.3em] mb-3">
          Custom Quote
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl mb-4 leading-tight px-4">
          Get a Personalized Quote
        </h1>
        <p className="text-white/60 text-base max-w-2xl mx-auto px-6 leading-relaxed">
          Enter your trip below for an instant quote on Executive Sedans, SUVs,
          and Sprinter vans. For weddings, multi-stop tours, party buses, and
          stretch limousines, our team replies with a custom quote within ~15
          minutes during business hours.
        </p>
      </section>

      <BookingForm />
      <Footer />
    </main>
  );
}
