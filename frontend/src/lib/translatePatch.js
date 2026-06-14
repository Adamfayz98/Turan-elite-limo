/**
 * Google Translate + React 18 DOM-mutation crash patch.
 *
 * Symptom in production:
 *   NotFoundError: Failed to execute 'removeChild' on 'Node':
 *   The node to be removed is not a child of this node.
 *
 * Root cause:
 *   Google Translate (and a couple of browser-extension translators) rewrites
 *   the DOM by wrapping text nodes in <font> elements + reparenting them.
 *   React's reconciler still holds a reference to the original parent →
 *   parent.removeChild(child) throws because Translate has already moved it.
 *
 * Fix:
 *   Monkey-patch Node.prototype.removeChild and Node.prototype.insertBefore
 *   to gracefully no-op (and log a warning) when the parent/child invariant
 *   is broken. React's next render cycle re-reconciles correctly and the
 *   user never sees a crash.
 *
 * This is the same pattern used by Microsoft Teams, Slack web, Notion, and
 * Stripe Checkout. It's safe — we only intercept *broken* invariants; valid
 * calls pass through untouched.
 */
export function installTranslateResilientDomPatches() {
  if (typeof window === "undefined" || typeof Node === "undefined") return;
  if (window.__translateDomPatched) return;
  window.__translateDomPatched = true;

  const origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function patchedRemoveChild(child) {
    if (child && child.parentNode !== this) {
      // Translate (or another DOM-mutating extension) moved this node already.
      // No-op + warn so the React render keeps marching.
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          "[translate-patch] Suppressed removeChild on detached node — likely Google Translate / browser extension DOM mutation.",
        );
      }
      return child;
    }
    return origRemoveChild.call(this, child);
  };

  const origInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function patchedInsertBefore(newNode, refNode) {
    if (refNode && refNode.parentNode !== this) {
      // The reference node has been reparented by an extension. Best effort:
      // append at the end instead of throwing.
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          "[translate-patch] insertBefore reference detached — falling back to appendChild.",
        );
      }
      return origInsertBefore.call(this, newNode, null);
    }
    return origInsertBefore.call(this, newNode, refNode);
  };
}
