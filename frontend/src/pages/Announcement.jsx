import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Calendar, ArrowLeft } from "lucide-react";

import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Announcement() {
  const { slug } = useParams();
  const [item, setItem] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/announcements/${slug}`);
        setItem(data);
        // SEO: set the document title + meta description per announcement
        document.title = `${data.title} · TuranEliteLimo`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) {
          meta.setAttribute(
            "content",
            (data.body || data.title || "").slice(0, 160),
          );
        }
        // JSON-LD for Google: NewsArticle / Article schema
        const existing = document.querySelector('script[data-news-jsonld]');
        if (existing) existing.remove();
        const ld = document.createElement("script");
        ld.type = "application/ld+json";
        ld.setAttribute("data-news-jsonld", "1");
        ld.textContent = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: data.title,
          description: (data.body || "").slice(0, 200),
          datePublished: data.created_at,
          dateModified: data.updated_at || data.created_at,
          author: { "@type": "Organization", name: "TuranEliteLimo" },
          publisher: {
            "@type": "Organization",
            name: "TuranEliteLimo",
            url: "https://turanelitelimo.com",
          },
        });
        document.head.appendChild(ld);
      } catch {
        setNotFound(true);
      }
    })();
    return () => {
      document.title = "TuranEliteLimo · Chauffeured Black-Car Service";
      const ld = document.querySelector('script[data-news-jsonld]');
      if (ld) ld.remove();
    };
  }, [slug]);

  if (notFound) {
    return (
      <main className="bg-[#050505] text-white min-h-screen">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-32 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-[#D4AF37] mb-3">404</div>
          <h1 className="font-serif text-4xl">Announcement not found</h1>
          <p className="text-white/55 mt-4">
            That post may have been removed or expired.
          </p>
          <Link to="/" className="inline-block mt-8 text-[#D4AF37] hover:underline">
            ← Back to home
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  if (!item) {
    return (
      <main className="bg-[#050505] text-white min-h-screen">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-32">
          <div className="animate-pulse">
            <div className="h-3 w-24 bg-white/10 rounded mb-4" />
            <div className="h-10 w-3/4 bg-white/10 rounded" />
            <div className="h-4 w-full bg-white/5 rounded mt-6" />
            <div className="h-4 w-5/6 bg-white/5 rounded mt-2" />
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="bg-[#050505] text-white min-h-screen" data-testid="announcement-page">
      <Navbar />
      <article className="max-w-3xl mx-auto px-4 md:px-8 pt-32 pb-24">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white mb-8"
        >
          <ArrowLeft className="w-3 h-3" /> Back to home
        </Link>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] mb-4">
          <Calendar className="w-3 h-3" />
          {item.created_at
            ? new Date(item.created_at).toLocaleDateString(undefined, {
                month: "long", day: "numeric", year: "numeric",
              })
            : ""}
        </div>
        <h1 className="font-serif text-4xl md:text-5xl leading-tight">{item.title}</h1>
        {item.body && (
          <div className="prose prose-invert max-w-none mt-8 text-white/80 leading-relaxed whitespace-pre-wrap text-base md:text-[17px]">
            {item.body}
          </div>
        )}
        {item.cta_url && (
          <a
            href={item.cta_url}
            target={item.cta_url.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            data-testid="announcement-cta"
            className="inline-block mt-10 bg-[#D4AF37] hover:bg-[#B3922E] text-black font-medium px-6 py-3 rounded-full transition-colors"
          >
            {item.cta_label || "Learn more"} →
          </a>
        )}
      </article>
      <Footer />
    </main>
  );
}
