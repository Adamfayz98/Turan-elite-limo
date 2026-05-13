/**
 * TuranEliteLimo brand mark — gold crescent ring with wolf silhouette + stars.
 * Renders as a transparent-background PNG so it blends with any dark/light surface.
 */
export default function Logo({ size = 32, className = "" }) {
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
