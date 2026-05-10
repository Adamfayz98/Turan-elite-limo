import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format a 24h "HH:MM" string as 12-hour with AM/PM. Returns "" for empty/invalid.
 * Examples: "08:30" → "8:30 AM", "13:15" → "1:15 PM", "00:00" → "12:00 AM".
 */
export function formatTime12h(time24) {
  if (!time24 || typeof time24 !== "string" || !time24.includes(":")) return "";
  const [hRaw, mRaw] = time24.split(":");
  const h = parseInt(hRaw, 10);
  const m = mRaw.padStart(2, "0").slice(0, 2);
  if (Number.isNaN(h)) return "";
  const meridiem = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m} ${meridiem}`;
}

