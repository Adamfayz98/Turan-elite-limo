import { useState } from "react";
import Logo from "@/components/Logo";

const API = process.env.REACT_APP_BACKEND_URL || "";

export default function AccountDeletion() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter the email address on your account.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/account/deletion-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), reason: reason.trim() }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || "Submission failed");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please email us at support@turanelitelimo.com.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-10">
          <Logo size={48} />
          <span className="text-xl tracking-wide">TuranEliteLimo</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-light tracking-tight mb-3">
          Delete your <span className="italic text-[#D4AF37]">account</span>
        </h1>
        <p className="text-white/60 mb-8 text-sm">
          Request deletion of your TuranEliteLimo account and all associated personal data.
        </p>

        <section className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 space-y-3 text-sm">
          <h2 className="text-base font-medium text-[#D4AF37]">What gets deleted</h2>
          <ul className="list-disc pl-5 space-y-1 text-white/80">
            <li>Your name, email address, phone number, and password.</li>
            <li>Saved addresses and personal preferences.</li>
            <li>Notification tokens and device identifiers tied to your account.</li>
            <li>Customer support messages you sent to us.</li>
          </ul>
          <h2 className="text-base font-medium text-[#D4AF37] pt-3">What we must keep</h2>
          <ul className="list-disc pl-5 space-y-1 text-white/80">
            <li>Booking and payment records, retained for up to <strong>7 years</strong> to comply with U.S. tax, financial, and transportation regulations (these records are anonymized — your name is replaced with a generic ID, but the trip and amount are kept).</li>
            <li>Aggregated, non-identifying analytics that cannot be traced back to you.</li>
          </ul>
          <h2 className="text-base font-medium text-[#D4AF37] pt-3">How long it takes</h2>
          <p className="text-white/80">
            Deletion is processed within <strong>30 days</strong> of your request. You will receive a confirmation email once it&apos;s complete.
          </p>
        </section>

        {submitted ? (
          <div className="bg-green-900/30 border border-green-500/30 rounded-2xl p-6">
            <h2 className="text-xl text-[#D4AF37] mb-2">Request received</h2>
            <p className="text-white/80 text-sm">
              We&apos;ve received your deletion request for <strong>{email}</strong>. Our team will verify ownership of the account and process the deletion within 30 days. You&apos;ll receive a confirmation email once it&apos;s complete.
            </p>
            <p className="text-white/60 text-xs mt-3">
              Need to follow up? Email{" "}
              <a href="mailto:support@turanelitelimo.com" className="text-[#D4AF37] underline">
                support@turanelitelimo.com
              </a>{" "}
              with your request reference.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="account-deletion-form">
            <div>
              <label className="block text-sm text-white/70 mb-1">Account email *</label>
              <input
                data-testid="account-deletion-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white outline-none focus:border-[#D4AF37]"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Reason (optional)</label>
              <textarea
                data-testid="account-deletion-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white outline-none focus:border-[#D4AF37]"
                placeholder="Tell us why you're leaving (helps us improve)."
              />
            </div>
            {error && <div className="text-red-400 text-sm" data-testid="account-deletion-error">{error}</div>}
            <button
              type="submit"
              disabled={submitting}
              data-testid="account-deletion-submit"
              className="w-full sm:w-auto px-8 py-3 bg-[#D4AF37] text-black font-medium rounded-full hover:bg-[#E5C158] disabled:opacity-50 transition"
            >
              {submitting ? "Submitting…" : "Request deletion"}
            </button>
          </form>
        )}

        <p className="text-white/40 text-xs mt-10">
          Prefer to email us directly? Send a deletion request from the email address on your account to{" "}
          <a href="mailto:support@turanelitelimo.com" className="text-[#D4AF37]">support@turanelitelimo.com</a>{" "}
          with the subject &quot;Account deletion&quot;.
        </p>

        <div className="mt-10 text-sm text-white/50">
          <a href="/" className="hover:text-[#D4AF37]">← Back to home</a>
        </div>
      </div>
    </div>
  );
}
