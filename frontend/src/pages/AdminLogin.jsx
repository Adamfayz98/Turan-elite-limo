import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck, Mail } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11";

export default function AdminLogin() {
  const nav = useNavigate();
  const [step, setStep] = useState("credentials"); // credentials | code
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [challenge, setChallenge] = useState(null); // { challenge_id, recovery_email_masked }
  const [code, setCode] = useState("");
  const codeInputRef = useRef(null);

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  const startLogin = async (silent = false) => {
    if (!silent) setSubmitting(true);
    else setResending(true);
    try {
      const { data } = await api.post("/admin/login", form);
      setChallenge(data);
      setStep("code");
      setCode("");
      toast.success(
        silent
          ? `New code sent to ${data.recovery_email_masked}`
          : `Code sent to ${data.recovery_email_masked}`,
      );
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Login failed");
    } finally {
      setSubmitting(false);
      setResending(false);
    }
  };

  const onCredentialsSubmit = (e) => {
    e.preventDefault();
    startLogin(false);
  };

  const onCodeSubmit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return toast.error("Enter the 6-digit code from your email.");
    setSubmitting(true);
    try {
      const { data } = await api.post("/admin/verify-2fa", {
        challenge_id: challenge.challenge_id,
        code,
      });
      localStorage.setItem("turon_admin_token", data.token);
      localStorage.setItem("turon_admin_email", data.email);
      toast.success("Welcome back.");
      nav("/admin");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Invalid code");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6">
      <div className="absolute inset-0 -z-10 opacity-40">
        <img
          src="https://images.pexels.com/photos/7594130/pexels-photo-7594130.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1080&w=1920"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-black" />
      </div>

      <div className="w-full max-w-md">
        <Link
          to="/"
          data-testid="admin-back-home"
          className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-white/50 hover:text-[#D4AF37] mb-8"
        >
          ← Back to site
        </Link>

        <div
          data-testid="admin-login-card"
          className="bg-[#0A0A0A]/90 backdrop-blur border border-[#1F1F1F] rounded-2xl p-8 md:p-10"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full border border-[#D4AF37]/30 flex items-center justify-center">
              <Logo size={28} className="text-[#D4AF37]" />
            </div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">Concierge Access</span>
          </div>

          {step === "credentials" ? (
            <>
              <h1 className="font-serif text-3xl md:text-4xl mt-4">Admin Sign In</h1>
              <p className="mt-3 text-white/55 text-sm">
                Enter your credentials. We'll email a one-time code to your recovery address before granting access.
              </p>

              <form onSubmit={onCredentialsSubmit} className="mt-8 space-y-5" data-testid="admin-login-form">
                <div>
                  <Label className="text-white/80 text-xs uppercase tracking-wider">Email</Label>
                  <Input
                    data-testid="admin-email"
                    required
                    type="email"
                    className={cn(inputCls, "mt-2")}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="admin@turonlimo.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label className="text-white/80 text-xs uppercase tracking-wider">Password</Label>
                  <Input
                    data-testid="admin-password"
                    required
                    type="password"
                    className={cn(inputCls, "mt-2")}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  data-testid="admin-login-submit"
                  className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-12 font-medium"
                >
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {submitting ? "Sending code…" : "Continue"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs">
                <ShieldCheck className="w-3.5 h-3.5" /> Two-factor verification
              </div>
              <h1 className="font-serif text-3xl md:text-4xl mt-4">Enter the 6-digit code</h1>
              <p className="mt-3 text-white/55 text-sm flex items-start gap-2">
                <Mail className="w-4 h-4 mt-0.5 text-[#D4AF37] flex-shrink-0" />
                <span>
                  We sent a code to{" "}
                  <span className="text-white">{challenge?.recovery_email_masked}</span>. It expires in 10 minutes.
                </span>
              </p>

              <form onSubmit={onCodeSubmit} className="mt-8 space-y-5" data-testid="admin-2fa-form">
                <div>
                  <Label className="text-white/80 text-xs uppercase tracking-wider">Verification code</Label>
                  <Input
                    ref={codeInputRef}
                    data-testid="admin-2fa-code"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    className={cn(
                      inputCls,
                      "mt-2 text-center font-mono text-2xl tracking-[0.6em]",
                    )}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting || code.length !== 6}
                  data-testid="admin-2fa-submit"
                  className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-12 font-medium"
                >
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {submitting ? "Verifying…" : "Verify & Sign In"}
                </Button>
                <div className="flex items-center justify-between text-xs text-white/55 pt-1">
                  <button
                    type="button"
                    data-testid="admin-2fa-back"
                    onClick={() => {
                      setStep("credentials");
                      setCode("");
                    }}
                    className="hover:text-[#D4AF37] underline-offset-4 hover:underline"
                  >
                    ← Use a different account
                  </button>
                  <button
                    type="button"
                    data-testid="admin-2fa-resend"
                    disabled={resending}
                    onClick={() => startLogin(true)}
                    className="hover:text-[#D4AF37] underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    {resending ? "Sending…" : "Resend code"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
