import { useEffect, useRef } from "react";
import { trackPurchase } from "@/lib/googleAdsEvents";

/**
 * Fires the Google Ads PURCHASE conversion when the booking flips to "paid".
 * This is the highest-value signal we send to Google Ads — it tells PMax
 * "this click earned us real revenue, find more like them".
 *
 * IMPORTANT: uses `booking.id` (UUID) as transaction_id — NOT the human
 * confirmation number. Google Ads dedupes conversions across events
 * (begin_checkout, purchase) using transaction_id, so every event in
 * the funnel MUST use the same identifier. begin_checkout upstream in
 * PayBooking.jsx already uses booking.id — matching that here prevents
 * Google's tag audit from flagging "invalid transaction IDs" for
 * mismatched attribution across the funnel.
 *
 * For Lead / Phone Call / Begin Checkout conversions see lib/googleAdsEvents.js.
 */
export default function GoogleAdsConversion({ booking }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    if (!booking || (booking.payment_status !== "paid" && booking.payment_status !== "card_on_file")) return;
    if (!booking.id) return;
    // Internal-test exclusion — Adam's own test bookings (and any QA email
    // in GOOGLE_ADS_EXCLUDED_EMAILS on the backend) never fire the Purchase
    // event. Prevents self-training Smart Bidding on our own dollars.
    if (booking.is_internal_test) {
      fired.current = true;
      return;
    }
    trackPurchase({
      bookingId: booking.id,
      // Use realized revenue (post-promo) when available so Ads gets the
      // TRUE conversion value, not the pre-promo quote.
      amount: booking.pay_later_amount ?? booking.paid_amount ?? booking.quote_amount,
      email: booking.email,
      phone: booking.phone,
    });
    fired.current = true;
  }, [booking]);
  return null;
}
