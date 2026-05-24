import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import { api, formatApiErrorDetail } from "@/lib/api";

// Driver-specific reset-password page. Identical UX to the customer ResetPassword
// page but hits /driver-auth/reset-password instead, so a single token type
// can only reset its own account class.
export default function DriverResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("Password must be at least 8 characters");
    if (pwd !== confirm) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      await api.post("/driver-auth/reset-password", { token, new_password: pwd });
      setDone(true);
      toast.success("Password updated. You can sign in now.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Reset failed — the link may have expired.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#0e0e0e] border border-white/10 rounded-2xl p-8 text-center">
          <p className="text-white/70">This reset link is missing its token.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-8">
          <Logo variant="full" height={60} />
        </div>
        <div className="bg-[#0e0e0e] border border-[#D4AF37]/20 rounded-2xl p-8">
          {done ? (
            <div className="text-center">
              <h1 className="text-2xl text-white mb-3">Driver password updated</h1>
              <p className="text-white/60 text-sm mb-6">
                You can now sign in with your new password in the TuranEliteLimo driver app.
              </p>
              <button
                data-testid="driver-reset-pwd-back-to-home"
                onClick={() => navigate("/")}
                className="px-6 py-3 rounded-full bg-[#D4AF37] text-black font-semibold text-sm"
              >
                Back to home
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <p className="text-[#D4AF37] text-xs uppercase tracking-widest mb-2">Driver account</p>
              <h1 className="text-2xl text-white mb-1">Choose a new password</h1>
              <p className="text-white/55 text-sm mb-6">Must be at least 8 characters.</p>
              <input
                data-testid="driver-reset-pwd-input"
                type="password"
                placeholder="New password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                autoComplete="new-password"
                className="w-full px-4 py-3 mb-3 rounded-lg bg-black border border-white/15 text-white placeholder:text-white/30 focus:border-[#D4AF37] outline-none"
                autoFocus
              />
              <input
                data-testid="driver-reset-pwd-confirm"
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full px-4 py-3 mb-5 rounded-lg bg-black border border-white/15 text-white placeholder:text-white/30 focus:border-[#D4AF37] outline-none"
              />
              <button
                data-testid="driver-reset-pwd-submit"
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-full bg-[#D4AF37] text-black font-semibold text-sm disabled:opacity-60"
              >
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
