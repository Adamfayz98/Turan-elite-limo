import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, ShieldCheck } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11";

export default function AccountTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({
    new_email: "",
    recovery_email: "",
    new_password: "",
    confirm_password: "",
    current_password: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/admin/account");
        setInfo(data);
        setForm((f) => ({
          ...f,
          new_email: data.email,
          recovery_email: data.recovery_email,
        }));
      } catch (err) {
        toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load account");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSave = async (e) => {
    e.preventDefault();
    if (!form.current_password) {
      return toast.error("Enter your current password to confirm changes.");
    }
    if (form.new_password && form.new_password !== form.confirm_password) {
      return toast.error("New password and confirmation do not match.");
    }
    if (form.new_password && form.new_password.length < 8) {
      return toast.error("New password must be at least 8 characters.");
    }
    const payload = { current_password: form.current_password };
    if (form.new_email && form.new_email.toLowerCase() !== info.email.toLowerCase()) {
      payload.new_email = form.new_email;
    }
    if (
      form.recovery_email &&
      form.recovery_email.toLowerCase() !== info.recovery_email.toLowerCase()
    ) {
      payload.recovery_email = form.recovery_email;
    }
    if (form.new_password) payload.new_password = form.new_password;
    if (Object.keys(payload).length === 1) {
      return toast.info("No changes to save.");
    }
    setSaving(true);
    try {
      const { data } = await api.patch("/admin/account", payload);
      setInfo(data);
      // If sign-in email changed, the JWT issued under the old email is still valid
      // until expiry — but the localStorage email label should match for clarity.
      localStorage.setItem("turon_admin_email", data.email);
      setForm({
        new_email: data.email,
        recovery_email: data.recovery_email,
        new_password: "",
        confirm_password: "",
        current_password: "",
      });
      toast.success("Account updated. Confirmation emails sent.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-12 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div data-testid="account-tab" className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-8 md:p-10 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37]">Account</div>
          <h2 className="font-serif text-2xl mt-0.5">Login & security</h2>
        </div>
      </div>
      <p className="text-white/55 text-sm mt-4">
        Update your sign-in email, password, and the recovery email that receives 2-factor codes.
      </p>

      <form onSubmit={onSave} className="mt-8 space-y-6" data-testid="account-form">
        <div>
          <Label className="text-white/80 text-xs uppercase tracking-wider">Sign-in email</Label>
          <Input
            data-testid="account-email"
            type="email"
            className={cn(inputCls, "mt-2")}
            value={form.new_email}
            onChange={(e) => setForm((f) => ({ ...f, new_email: e.target.value }))}
          />
        </div>

        <div>
          <Label className="text-white/80 text-xs uppercase tracking-wider">
            Recovery / 2FA email
          </Label>
          <Input
            data-testid="account-recovery-email"
            type="email"
            className={cn(inputCls, "mt-2")}
            value={form.recovery_email}
            onChange={(e) => setForm((f) => ({ ...f, recovery_email: e.target.value }))}
            placeholder="your.personal@gmail.com"
          />
          <p className="text-[11px] text-white/45 mt-1.5">
            6-digit verification codes will be sent here on every sign-in.
          </p>
        </div>

        <div className="pt-4 border-t border-white/5">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45 mb-4">Change password (optional)</div>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">New password</Label>
              <Input
                data-testid="account-new-password"
                type="password"
                className={cn(inputCls, "mt-2")}
                value={form.new_password}
                onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Confirm new password</Label>
              <Input
                data-testid="account-confirm-password"
                type="password"
                className={cn(inputCls, "mt-2")}
                value={form.confirm_password}
                onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <Label className="text-white/80 text-xs uppercase tracking-wider">
            Current password <span className="text-red-400">*</span>
          </Label>
          <Input
            data-testid="account-current-password"
            required
            type="password"
            className={cn(inputCls, "mt-2")}
            value={form.current_password}
            onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))}
            placeholder="Required to confirm any change"
            autoComplete="current-password"
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={saving}
            data-testid="account-save"
            className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full px-8 h-11 font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
