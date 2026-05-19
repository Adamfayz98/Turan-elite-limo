import { useEffect } from "react";

/**
 * Site-wide Google tag (gtag.js).
 * Loads on every page so Google Ads can:
 *   - mark the account's tag as "Active" (clears the "No tag found" warning),
 *   - power remarketing audiences,
 *   - power enhanced conversions.
 *
 * Per-conversion firing (on /thank-you) still happens in GoogleAdsConversion.jsx.
 * Both components use a shared `data-gads-loaded` marker so the gtag.js library
 * script is only ever injected once.
 *
 * No-op when REACT_APP_GADS_CONVERSION_ID is missing (e.g., dev/preview without env).
 */
export default function GoogleSiteTag() {
  useEffect(() => {
    const convId = process.env.REACT_APP_GADS_CONVERSION_ID;
    if (!convId) return;

    // Initialize dataLayer + gtag shim
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;
    window.gtag("js", new Date());
    window.gtag("config", convId);

    if (!document.querySelector(`script[data-gads-loaded="${convId}"]`)) {
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${convId}`;
      s.setAttribute("data-gads-loaded", convId);
      document.head.appendChild(s);
    }
  }, []);

  return null;
}
