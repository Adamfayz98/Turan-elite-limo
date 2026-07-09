import { useEffect, useState } from "react";

import { api } from "@/lib/api";

/**
 * Renders schema.org JSON-LD structured data into the document head.
 * Google uses this to understand the business + show rich results
 * (rating stars, hours, phone, active offers) on the search page.
 *
 * Updates dynamically if you change the active banner promo so the
 * "Offer" entity in search results reflects your current discount.
 */
export default function SeoStructuredData() {
  const [promo, setPromo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/promos/banner");
        if (data?.code) setPromo(data);
      } catch {
        /* silent */
      }
    })();
  }, []);

  useEffect(() => {
    const SCRIPT_ID = "tel-jsonld";
    // Remove any previously injected script (e.g. when promo changes)
    document.getElementById(SCRIPT_ID)?.remove();

    const business = {
      "@context": "https://schema.org",
      "@type": "LimousineService",
      "@id": "https://turanelitelimo.com/#business",
      name: "TuranEliteLimo",
      alternateName: "Turan Elite Limo",
      description:
        "Premium chauffeured limo service serving San Francisco, the Bay Area, Silicon Valley, and Northern California. Airport transfers, hourly chauffeur, weddings, corporate, and events.",
      url: "https://turanelitelimo.com",
      logo: "https://turanelitelimo.com/logo-mark.png",
      image: "https://turanelitelimo.com/logo-full.png",
      telephone: "+1-650-672-3520",
      email: "support@turanelitelimo.com",
      priceRange: "$$$",
      currenciesAccepted: "USD",
      paymentAccepted: "Credit Card, Stripe",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Millbrae",
        addressRegion: "CA",
        addressCountry: "US",
      },
      areaServed: [
        { "@type": "City", name: "San Francisco" },
        { "@type": "City", name: "Millbrae" },
        { "@type": "City", name: "San Mateo" },
        { "@type": "City", name: "Palo Alto" },
        { "@type": "City", name: "San Jose" },
        { "@type": "City", name: "Oakland" },
        { "@type": "Place", name: "Bay Area" },
        { "@type": "Place", name: "Silicon Valley" },
        { "@type": "Place", name: "Northern California" },
      ],
      serviceType: [
        "Airport Transfer",
        "Hourly Chauffeur",
        "Wedding Limo",
        "Corporate Transportation",
        "Wine Tour",
        "Event Transportation",
      ],
      sameAs: [
        "https://www.yelp.com/biz/turanelitelimo-millbrae",
      ],
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ],
          opens: "00:00",
          closes: "23:59",
        },
      ],
    };

    // Attach an Offer entity when there's an active sitewide banner promo
    if (promo?.code) {
      const discountTxt =
        promo.discount_type === "percent"
          ? `${promo.value}% off`
          : `$${promo.value} off`;
      business.makesOffer = {
        "@type": "Offer",
        name: promo.first_ride_only
          ? `New riders: ${discountTxt} your first ride`
          : `${discountTxt} your chauffeured ride`,
        description: promo.description || `Use code ${promo.code} at checkout.`,
        priceSpecification: {
          "@type": "PriceSpecification",
          minPrice: promo.min_ride_amount || 0,
          priceCurrency: "USD",
        },
        availability: "https://schema.org/InStock",
        validThrough: promo.expires_at || undefined,
        url: "https://turanelitelimo.com/#booking",
        category: "DiscountCode",
        eligibleTransactionVolume: promo.min_ride_amount
          ? {
              "@type": "PriceSpecification",
              minPrice: promo.min_ride_amount,
              priceCurrency: "USD",
            }
          : undefined,
      };
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.type = "application/ld+json";
    script.text = JSON.stringify(business);
    document.head.appendChild(script);

    return () => {
      document.getElementById(SCRIPT_ID)?.remove();
    };
  }, [promo]);

  return null;
}
