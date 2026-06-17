import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";

import { api } from "@/lib/api";

/**
 * Floating chat bubble at the bottom-right of every public page.
 *
 * - Opens an LLM-powered concierge (Sage) that answers FAQs, gives ballpark
 *   pricing, and steers serious leads to /booking.
 * - Session persists across page refreshes via localStorage so a return visit
 *   resumes the same thread.
 * - Falls back gracefully if the backend chat endpoint isn't reachable —
 *   shows a friendly error and hides the typing indicator.
 *
 * Backend contract:
 *   POST /api/chat/start   → { session_id, opener }
 *   POST /api/chat/message → { session_id, reply, needs_human }
 *   GET  /api/chat/{id}    → { history: [...] }
 */
const STORAGE_KEY = "turan_chat_session";

export default function FloatingChatWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const scrollerRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Focus the input when the panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Lazy-boot the session on first open. If we have a stored ID, try
  // restoring it first; if that 404s, mint a fresh one.
  const ensureSession = async () => {
    if (sessionId) return sessionId;
    setBooting(true);
    setErrorMsg("");
    try {
      const stored = (() => {
        try {
          return localStorage.getItem(STORAGE_KEY);
        } catch {
          return null;
        }
      })();
      if (stored) {
        try {
          const { data } = await api.get(`/chat/${stored}`);
          if (data?.session_id && Array.isArray(data.history)) {
            setSessionId(stored);
            setMessages(data.history);
            return stored;
          }
        } catch {
          // fall through to mint a fresh session
        }
      }
      const { data } = await api.post("/chat/start", {
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        referrer: typeof document !== "undefined" ? document.referrer : "",
      });
      try {
        localStorage.setItem(STORAGE_KEY, data.session_id);
      } catch {
        /* private mode — ignore */
      }
      setSessionId(data.session_id);
      const now = new Date().toISOString();
      setMessages([{ role: "assistant", content: data.opener, ts: now }]);
      return data.session_id;
    } catch (err) {
      setErrorMsg("Chat is offline at the moment — please call (650) 410-0687.");
      return null;
    } finally {
      setBooting(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const sid = await ensureSession();
    if (!sid) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text, ts: new Date().toISOString() }]);
    setSending(true);
    try {
      const { data } = await api.post("/chat/message", { session_id: sid, message: text });
      setMessages((m) => [...m, { role: "assistant", content: data.reply, ts: new Date().toISOString() }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Sorry — I hit a hiccup. Please try again, or text us at (650) 410-0687 and a real human will help right away.",
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  // Trigger button + panel render
  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          type="button"
          onClick={async () => {
            setOpen(true);
            await ensureSession();
          }}
          data-testid="chat-widget-open"
          className="fixed bottom-5 right-5 z-[100] w-14 h-14 rounded-full bg-[#D4AF37] text-black shadow-2xl flex items-center justify-center hover:bg-[#B3922E] transition-colors group"
          aria-label="Open chat with Sage"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#D4AF37]" />
          <span className="hidden md:block absolute right-full mr-3 whitespace-nowrap px-3 py-1.5 rounded-full bg-[#0A0A0A] border border-[#1F1F1F] text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <Sparkles className="w-3 h-3 inline mr-1 text-[#D4AF37]" />
            Chat with Sage
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          data-testid="chat-widget-panel"
          className="fixed bottom-5 right-5 z-[100] w-[95vw] max-w-[400px] h-[70vh] max-h-[600px] bg-[#0A0A0A] border border-[#27272A] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1F1F1F] bg-gradient-to-b from-[#D4AF37]/10 to-transparent">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#D4AF37] text-black flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-white text-sm font-semibold">Sage</div>
                <div className="text-white/45 text-[10px] uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                  Concierge · usually replies instantly
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              data-testid="chat-widget-close"
              className="text-white/55 hover:text-white p-1 rounded-md hover:bg-white/5"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollerRef}
            data-testid="chat-widget-messages"
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {booting && (
              <div className="flex items-center justify-center text-white/55 text-sm py-8">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Opening chat…
              </div>
            )}
            {errorMsg && (
              <div className="text-red-400 text-xs text-center py-2">{errorMsg}</div>
            )}
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} content={m.content} />
            ))}
            {sending && (
              <ChatBubble role="assistant" content="" typing />
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-[#1F1F1F] p-3">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                data-testid="chat-widget-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Ask about pricing, vehicles, anything…"
                className="flex-1 resize-none bg-[#0E0E0E] border border-[#27272A] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] max-h-32"
              />
              <button
                type="button"
                onClick={send}
                disabled={!input.trim() || sending || booting}
                data-testid="chat-widget-send"
                className="w-10 h-10 rounded-xl bg-[#D4AF37] text-black flex items-center justify-center hover:bg-[#B3922E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                aria-label="Send message"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="text-[10px] text-white/40 mt-1.5 text-center">
              Sage is an AI concierge. For an exact quote, visit{" "}
              <a
                href="/booking"
                className="text-[#D4AF37] hover:underline"
              >
                turanelitelimo.com/booking
              </a>
              .
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChatBubble({ role, content, typing = false }) {
  const isUser = role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`chat-bubble-${role}`}
    >
      <div
        className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-[#D4AF37] text-black rounded-br-sm"
            : "bg-[#1A1A1A] text-white border border-[#27272A] rounded-bl-sm"
        }`}
      >
        {typing ? <TypingDots /> : content}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Sage is typing">
      <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}
