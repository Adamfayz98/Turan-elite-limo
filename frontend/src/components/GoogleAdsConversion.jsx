import { useEffect, useRef } from "react";

/**
 * Fires a Google Ads conversion exactly once when a booking reaches `paid`.
 *
 * Reads two env vars (set them in the Emergent deployment dashboard when ready):
 *   REACT_APP_GADS_CONVERSION_ID     e.g. "AW-1234567890"
 *   REACT_APP_GADS_CONVERSION_LABEL  e.g. "aBc-D_ef1ghIjkL2MnO"
 *
 * If either is missing, the component is a no-op (so dev/preview never pings
 * Google Ads). Loads gtag.js asynchronously and de-dupes on transaction_id so
 * a page reload doesn't double-count the conversion.
 */
export default function GoogleAdsConversion({ booking }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!booking || booking.payment_status !== "paid") return;

    const convId = process.env.REACT_APP_GADS_CONVERSION_ID;
    const convLabel = process.env.REACT_APP_GADS_CONVERSION_LABEL;
    if (!convId || !convLabel) return; // no-op until configured

    const txnId = booking.confirmation_number || booking.id;

    // Avoid double-count if the customer reloads the receipt page.
    const stash = "_gads_fired_" + txnId;
    try {
      if (sessionStorage.getItem(stash)) return;
      sessionStorage.setItem(stash, "1");
    } catch {
      /* sessionStorage unavailable — proceed once anyway */
    }

    // Initialize dataLayer + gtag shim
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;
    window.gtag("js", new Date());
    window.gtag("config", convId);

    // Inject the gtag.js library script once
    if (!document.querySelector(`script[data-gads-loaded="${convId}"]`)) {
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${convId}`;
      s.setAttribute("data-gads-loaded", convId);
      document.head.appendChild(s);
    }

    // Fire the conversion
    window.gtag("event", "conversion", {
      send_to: `${convId}/${convLabel}`,
      value: Number(booking.quote_amount || 0),
      currency: "USD",
      transaction_id: txnId,
    });

    fired.current = true;
  }, [booking]);

  return null;
}
