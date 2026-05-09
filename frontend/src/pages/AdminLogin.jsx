import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post("/admin/login", form);
      localStorage.setItem("turon_admin_token", data.token);
      localStorage.setItem("turon_admin_email", data.email);
      toast.success("Welcome back.");
      nav("/admin");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Login failed");
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
          <h1 className="font-serif text-3xl md:text-4xl mt-4">Admin Sign In</h1>
          <p className="mt-3 text-white/55 text-sm">
            Manage reservations, inquiries, and customers for{" "}
            <span className="text-white">Turonlimo</span>.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="admin-login-form">
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
              {submitting ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
