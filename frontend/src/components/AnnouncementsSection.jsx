import { useEffect, useState } from "react";
import { Calendar, Megaphone } from "lucide-react";

import { api } from "@/lib/api";

/**
 * "Latest news" section on the homepage. Renders the up-to-10 most recent
 * active announcements flagged `show_on_homepage`. Each links to /news/:slug
 * for an indexable detail page.
 */
export default function AnnouncementsSection() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/announcements");
        setItems(data?.homepage || []);
      } catch {
        /* silent — section just hides */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded || items.length === 0) return null;

  return (
    <section
      data-testid="announcements-section"
      id="news"
      className="bg-[#050505] py-20 md:py-28 border-t border-[#1F1F1F]"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <div className="flex items-center gap-3 text-[#D4AF37] mb-2">
          <Megaphone className="w-4 h-4" />
          <span className="text-xs uppercase tracking-[0.3em]">Latest news</span>
        </div>
        <h2 className="font-serif text-4xl md:text-5xl text-white mb-12 max-w-2xl">
          What's new at TuranEliteLimo
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((a) => (
            <a
              key={a.id}
              href={a.cta_url || `/news/${a.slug}`}
              data-testid={`announcement-card-${a.id}`}
              className="group block bg-[#0A0A0A] hover:bg-[#0E0E0E] border border-[#1F1F1F] hover:border-[#D4AF37]/30 rounded-2xl p-6 md:p-7 transition-colors"
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/45 mb-3">
                <Calendar className="w-3 h-3" />
                {a.created_at ? new Date(a.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : ""}
              </div>
              <h3 className="font-serif text-xl md:text-2xl text-white group-hover:text-[#D4AF37] transition-colors leading-tight">
                {a.title}
              </h3>
              {a.body && (
                <p className="text-sm text-white/65 mt-3 leading-relaxed line-clamp-3">
                  {a.body}
                </p>
              )}
              <div className="text-xs text-[#D4AF37] mt-4 font-medium">
                {a.cta_label || "Read more"} →
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
