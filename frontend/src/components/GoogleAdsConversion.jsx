import { useEffect, useRef } from "react";
import { trackPurchase } from "@/lib/googleAdsEvents";

/**
 * Fires the Google Ads PURCHASE conversion when the booking flips to "paid".
 * This is the highest-value signal we send to Google Ads — it tells PMax
 * "this click earned us real revenue, find more like them".
 *
 * For Lead / Phone Call / Begin Checkout conversions see lib/googleAdsEvents.js.
 */
export default function GoogleAdsConversion({ booking }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    if (!booking || booking.payment_status !== "paid") return;
    trackPurchase({
      bookingId: booking.confirmation_number || booking.id,
      amount: booking.quote_amount,
      email: booking.email,
      phone: booking.phone,
    });
    fired.current = true;
  }, [booking]);
  return null;
}
