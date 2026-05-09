import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Phone, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, formatApiErrorDetail } from "@/lib/api";

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11";

export default function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/contact", form);
      toast.success("Message sent. We'll respond within hours.");
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err) {
      // Surface real error to the console so we can diagnose if it ever fails
      // eslint-disable-next-line no-console
      console.error("Contact submit failed:", err?.response?.status, err?.response?.data || err?.message);
      const detail = formatApiErrorDetail(err?.response?.data?.detail);
      const fallback =
        err?.response?.status >= 500
          ? "Our server hiccuped — please call us at (650) 410-0687."
          : "Couldn't send right now. Please try again or call (650) 410-0687.";
      toast.error(detail && detail !== "Something went wrong. Please try again." ? detail : fallback);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="contact"
      data-testid="contact-section"
      className="relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-16">
        <div className="lg:col-span-5">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">07 — Concierge</span>
          <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight">
            Speak with a <span className="italic">specialist.</span>
          </h2>
          <p className="mt-6 text-white/60 leading-relaxed">
            Custom itinerary? Multi-vehicle event? A question we haven't answered? Send us a note. A real person reads every message.
          </p>

          <div className="mt-12 space-y-6">
            <div className="flex items-start gap-4" data-testid="contact-info-phone">
              <div className="w-10 h-10 rounded-full border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">24/7 Reservations</div>
                <a href="tel:+15555555555" className="text-white text-lg hover:text-[#D4AF37] transition-colors">
                  (650) 410‑0687
                </a>
              </div>
            </div>
            <div className="flex items-start gap-4" data-testid="contact-info-email">
              <div className="w-10 h-10 rounded-full border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">Email</div>
                <a
                  href="mailto:turonlimosupport@gmail.com"
                  className="text-white text-lg hover:text-[#D4AF37] transition-colors"
                >
                  turonlimosupport@gmail.com
                </a>
              </div>
            </div>
            <div className="flex items-start gap-4" data-testid="contact-info-area">
              <div className="w-10 h-10 rounded-full border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">Headquarters</div>
                <div className="text-white text-lg leading-snug">
                  501 Broadway, #251<br />
                  Millbrae, CA 94030
                </div>
                <div className="text-white/50 text-xs mt-1">Serving the SF Bay Area & Northern California</div>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          data-testid="contact-form"
          className="lg:col-span-7 bg-[#0A0A0A] border border-[#1F1F1F] rounded-2xl p-6 md:p-10"
        >
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Name</Label>
              <Input
                data-testid="contact-name"
                required
                className={cn(inputCls, "mt-2")}
                value={form.name}
                onChange={update("name")}
              />
            </div>
            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Email</Label>
              <Input
                data-testid="contact-email"
                required
                type="email"
                className={cn(inputCls, "mt-2")}
                value={form.email}
                onChange={update("email")}
              />
            </div>
            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Phone</Label>
              <Input
                data-testid="contact-phone"
                className={cn(inputCls, "mt-2")}
                value={form.phone}
                onChange={update("phone")}
              />
            </div>
            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Subject</Label>
              <Input
                data-testid="contact-subject"
                className={cn(inputCls, "mt-2")}
                value={form.subject}
                onChange={update("subject")}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-white/80 text-xs uppercase tracking-wider">Message</Label>
              <Textarea
                data-testid="contact-message"
                required
                className={cn(
                  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-2 min-h-[160px]"
                )}
                value={form.message}
                onChange={update("message")}
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              data-testid="contact-submit"
              className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full px-8 h-12 font-medium"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitting ? "Sending…" : "Send Message"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
