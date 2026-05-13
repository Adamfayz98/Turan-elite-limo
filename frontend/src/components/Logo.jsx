/**
 * TuranEliteLimo brand logo.
 *
 * Variants:
 *   - "mark" (default): square gold-ring mark — use for compact spaces (favicon, mobile, admin tabs)
 *   - "full":           horizontal mark + wordmark — use for navbar / footer / hero
 *
 * Pass `size` (or `height` for "full") to control overall size.
 */
export default function Logo({ variant = "mark", size = 32, height, className = "" }) {
  if (variant === "full") {
    const h = height || size;
    return (
      <img
        src="/logo-full.png"
        alt="TuranEliteLimo"
        className={className}
        style={{ height: h, width: "auto", display: "block" }}
        draggable={false}
      />
    );
  }
  return (
    <img
      src="/logo-mark.png"
      alt="TuranEliteLimo"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
      draggable={false}
    />
  );
}
