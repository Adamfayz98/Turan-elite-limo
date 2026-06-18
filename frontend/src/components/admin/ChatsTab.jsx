import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Send, Loader2, Circle, AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Admin Chats tab — monitor every Sage session, take over the ones flagged
 * `needs_human`, and type replies that appear in the customer's widget within
 * ~5 seconds (the widget polls /chat/{id} every 5 sec while open).
 *
 * Two views:
 *   1. List view  — all sessions sorted needs_human-first, then by recency
 *   2. Thread view — full transcript + reply box + "mark handled" button
 */
export default function ChatsTab() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);

  const loadList = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/chat/sessions");
      setSessions(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load chat sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    // Lightweight 15-sec poll so new sessions / new customer messages show up
    // without the admin having to refresh.
    const id = setInterval(loadList, 15000);
    return () => clearInterval(id);
  }, []);

  if (activeId) {
    return (
      <ChatThread
        sessionId={activeId}
        onBack={() => {
          setActiveId(null);
          loadList();
        }}
      />
    );
  }

  const newCount = sessions.filter((s) => s.needs_human).length;

  return (
    <div className="space-y-5" data-testid="chats-tab">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl text-white">Sage Chats</h2>
          <p className="text-xs text-white/55 mt-1 max-w-2xl leading-relaxed">
            Every conversation Sage (your AI concierge) has had with customers. Red dot = Sage flagged the chat for human follow-up.
            Click any row to read the transcript and reply directly — your reply lands in the customer&apos;s chat panel within ~5 seconds.
          </p>
        </div>
        {newCount > 0 && (
          <span className="bg-red-500/15 border border-red-500/40 text-red-300 text-xs px-3 py-1 rounded-full" data-testid="chats-needs-human-count">
            {newCount} need follow-up
          </span>
        )}
      </div>

      {loading && (
        <div className="text-white/55 text-sm flex items-center gap-2 py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading chats…
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#27272A] bg-[#0A0A0A] p-8 text-center text-white/55 text-sm">
          <MessageCircle className="w-8 h-8 text-[#D4AF37]/50 mx-auto mb-3" />
          No chat sessions yet. Once visitors open the chat widget on the public site, conversations will appear here.
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#0E0E0E] border-b border-[#1F1F1F] text-[10px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="text-left px-4 py-2.5 w-8" />
                <th className="text-left px-3 py-2.5">Last message</th>
                <th className="text-left px-3 py-2.5">Updated</th>
                <th className="text-right px-3 py-2.5">Msgs</th>
                <th className="text-right px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.session_id}
                  onClick={() => setActiveId(s.session_id)}
                  data-testid={`chat-row-${s.session_id}`}
                  className="border-b border-[#1F1F1F] hover:bg-white/[0.02] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    {s.needs_human ? (
                      <AlertCircle className="w-4 h-4 text-red-400" title="Needs human follow-up" />
                    ) : (
                      <Circle className="w-3 h-3 text-white/20" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-white/85 truncate max-w-md">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 mr-1.5">
                        {s.last_role === "user" ? "Customer" : s.last_role === "admin" ? "You" : "Sage"}:
                      </span>
                      {s.last_preview || <span className="text-white/30 italic">(empty)</span>}
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">session {s.session_id.slice(0, 8)}</div>
                  </td>
                  <td className="px-3 py-3 text-white/60 tabular-nums text-xs">{fmtTime(s.updated_at)}</td>
                  <td className="px-3 py-3 text-white/60 text-right tabular-nums text-xs">{s.msg_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-transparent border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-7 px-3"
                      data-testid={`chat-open-${s.session_id}`}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChatThread({ sessionId, onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/chat/${sessionId}`);
      setMessages(data.history || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load thread");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Poll the thread every 5 sec while it's open so new customer messages
    // appear without refresh.
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [sessionId]);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.post(`/admin/chat/sessions/${sessionId}/reply`, { content: text });
      setDraft("");
      await load();
      toast.success("Reply sent — customer will see it within 5 seconds.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Reply failed");
    } finally {
      setSending(false);
    }
  };

  const markHandled = async () => {
    try {
      await api.post(`/admin/chat/sessions/${sessionId}/clear-needs-human`);
      toast.success("Marked as handled.");
      await load();
    } catch (err) {
      toast.error("Couldn't mark handled");
    }
  };

  return (
    <div className="space-y-4" data-testid="chat-thread">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button
          onClick={onBack}
          variant="outline"
          size="sm"
          data-testid="chat-thread-back"
          className="bg-transparent border-[#27272A] text-white/70 hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> All chats
        </Button>
        <Button
          onClick={markHandled}
          variant="outline"
          size="sm"
          className="bg-transparent border-green-700/40 text-green-300 hover:bg-green-700/10"
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark handled
        </Button>
      </div>

      <div
        ref={scrollerRef}
        className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 h-[55vh] overflow-y-auto space-y-3"
      >
        {loading && (
          <div className="text-white/55 text-sm flex items-center gap-2 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}
        {!loading && messages.map((m, i) => (
          <ThreadBubble key={i} m={m} />
        ))}
      </div>

      <div className="flex gap-2 items-end">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type your reply — Cmd/Ctrl+Enter to send"
          rows={3}
          data-testid="chat-thread-input"
          className="flex-1 bg-[#0E0E0E] border-[#27272A] text-white text-sm"
        />
        <Button
          onClick={send}
          disabled={!draft.trim() || sending}
          data-testid="chat-thread-send"
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] h-11 px-4"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" /> Send</>}
        </Button>
      </div>
      <p className="text-[10px] text-white/45 text-center">
        Your reply appears in the customer&apos;s chat widget within ~5 sec (their browser polls every 5 sec while the panel is open).
      </p>
    </div>
  );
}

function ThreadBubble({ m }) {
  const isUser = m.role === "user";
  const isAdmin = m.role === "admin";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-[#D4AF37] text-black rounded-br-sm"
            : isAdmin
              ? "bg-[#1E3A2E] text-white border border-green-700/50 rounded-bl-sm"
              : "bg-[#1A1A1A] text-white border border-[#27272A] rounded-bl-sm"
        }`}
      >
        <div className="text-[10px] uppercase tracking-wider mb-1 opacity-60">
          {isUser ? "Customer" : isAdmin ? (m.sender_name || "Admin") : "Sage"}
          {m.ts && <span className="ml-1.5">· {fmtTime(m.ts)}</span>}
        </div>
        {m.content}
      </div>
    </div>
  );
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
