import { Lock } from "lucide-react";

/**
 * Small "Secure payment via [Stripe logo]" badge using Stripe's official wordmark color (#635BFF).
 * The wordmark is rendered as inline SVG path data taken from Stripe's brand assets so it
 * matches the exact letterform used on stripe.com (no external image dependency / 404 risk).
 */
export default function StripeBadge({ className = "" }) {
  return (
    <div
      data-testid="stripe-badge"
      className={`inline-flex items-center gap-2 text-xs text-white/65 ${className}`}
    >
      <Lock className="w-3.5 h-3.5 text-emerald-400/80" />
      <span>Secure payment via</span>
      <span
        className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-[#635BFF] shadow-[0_2px_5px_rgba(99,91,255,0.35)]"
        aria-label="Stripe"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 60 25"
          className="h-3.5 w-auto"
          aria-hidden="true"
        >
          <path
            fill="#fff"
            d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.63l.21 1.02a4.65 4.65 0 0 1 3.23-1.29c2.91 0 5.65 2.59 5.65 7.4 0 5.27-2.71 7.6-5.68 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.55-1.65 2.55-3.87 0-2.16-1.04-3.84-2.55-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.88zm-4.32 9.35v9.79H19.8V5.57h3.7l.27 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.46 1.06zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.85zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.58-.24 1.58-1C6.31 13.81 0 14.51 0 9.91 0 6.97 2.24 5.27 5.58 5.27c1.95 0 3.71.46 4.83 1.05V10A11.4 11.4 0 0 0 5.6 8.85c-.86 0-1.4.25-1.4.9 0 1.66 6.4.9 6.4 5.5z"
          />
        </svg>
      </span>
    </div>
  );
}
