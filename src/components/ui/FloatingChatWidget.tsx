"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Loader2, Minus, Send, User, X } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  endpoint: string;
  payload?: Record<string, string | undefined>;
  suggestedQuestions?: string[];
  title?: string;
}

export function FloatingChatWidget({
  endpoint,
  payload = {},
  suggestedQuestions = [],
  title = "13Media Bot",
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: messages, ...payload }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages([...history, { role: "assistant", content: `Error: ${err.error ?? "Failed"}` }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      setMessages([...history, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: text }]);
      }
    } catch {
      setMessages([...history, { role: "assistant", content: "Connection error — please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Chat window */}
      <div
        style={{
          position: "fixed",
          bottom: "88px",
          right: "24px",
          width: "360px",
          maxHeight: "520px",
          zIndex: 9998,
          display: "flex",
          flexDirection: "column",
          borderRadius: "18px",
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          transformOrigin: "bottom right",
          transition: "opacity 0.22s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1)",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1) translateY(0)" : "scale(0.85) translateY(16px)",
          pointerEvents: open ? "auto" : "none",
        }}
        role="dialog"
        aria-label={title}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          background: "linear-gradient(135deg, #F97316, #FFC21A)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%",
              background: "rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bot size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>{title}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", gap: "4px", marginTop: "1px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
                Online
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { icon: <Minus size={12} />, label: "Minimize", action: () => setOpen(false) },
              { icon: <X size={12} />, label: "Close", action: () => { setOpen(false); } },
            ].map((b) => (
              <button key={b.label} onClick={b.action} aria-label={b.label} style={{
                width: "26px", height: "26px", borderRadius: "6px",
                background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {b.icon}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "12px",
          display: "flex", flexDirection: "column", gap: "10px",
          background: "var(--bg-page, var(--bg-subtle))",
          minHeight: "200px", maxHeight: "300px",
        }}>
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", textAlign: "center", padding: "8px" }}>
              <Bot size={32} style={{ color: "var(--accent)", opacity: 0.25 }} />
              <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>Ask anything about your data</p>
              {suggestedQuestions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" }}>
                  {suggestedQuestions.slice(0, 4).map((q) => (
                    <button key={q} onClick={() => send(q)} style={{
                      fontSize: "11px", padding: "5px 10px", borderRadius: "20px",
                      border: "1px solid var(--border)", background: "var(--bg-subtle)",
                      color: "var(--text-secondary)", cursor: "pointer",
                    }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", gap: "7px", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end" }}>
              {msg.role === "assistant" && (
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg, #F97316, #FFC21A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Bot size={12} color="#fff" />
                </div>
              )}
              <div style={{
                maxWidth: "240px", padding: "8px 12px", borderRadius: "14px",
                fontSize: "12px", lineHeight: "1.55", whiteSpace: "pre-wrap",
                ...(msg.role === "user"
                  ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: "4px" }
                  : { background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderBottomLeftRadius: "4px" }),
              }}>
                {msg.content || (msg.role === "assistant" && <span style={{ opacity: 0.4 }}>▋</span>)}
              </div>
              {msg.role === "user" && (
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--bg-subtle)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <User size={12} style={{ color: "var(--text-muted)" }} />
                </div>
              )}
            </div>
          ))}

          {loading && messages[messages.length - 1]?.role !== "assistant" && (
            <div style={{ display: "flex", gap: "7px", alignItems: "flex-end" }}>
              <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg, #F97316, #FFC21A)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bot size={12} color="#fff" />
              </div>
              <div style={{ padding: "8px 12px", borderRadius: "14px", borderBottomLeftRadius: "4px", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-muted)" }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          display: "flex", alignItems: "flex-end", gap: "8px",
          padding: "8px 10px", borderTop: "1px solid var(--border)",
          background: "var(--bg-card)", flexShrink: 0,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask a question… (Enter to send)"
            rows={1}
            style={{
              flex: 1, resize: "none", background: "var(--bg-subtle)",
              border: "1px solid var(--border)", borderRadius: "12px",
              padding: "7px 12px", fontSize: "12px", color: "var(--text-primary)",
              outline: "none", fontFamily: "inherit", lineHeight: "1.4",
              maxHeight: "80px", overflow: "auto",
            }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 80)}px`;
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            style={{
              width: "32px", height: "32px", borderRadius: "50%", border: "none",
              background: loading || !input.trim() ? "var(--bg-subtle)" : "linear-gradient(135deg, #F97316, #FFC21A)",
              cursor: loading || !input.trim() ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all 0.15s",
            }}
            aria-label="Send message"
          >
            <Send size={13} color={loading || !input.trim() ? "var(--text-muted)" : "#fff"} />
          </button>
        </div>

        {messages.length > 0 && (
          <div style={{ padding: "4px 10px 8px", background: "var(--bg-card)", flexShrink: 0 }}>
            <button onClick={() => setMessages([])} style={{
              fontSize: "10px", color: "var(--text-muted)", background: "none",
              border: "none", cursor: "pointer", padding: 0,
            }}>
              Clear chat
            </button>
          </div>
        )}
      </div>

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open 13Media Bot"}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: open ? "var(--bg-subtle)" : "linear-gradient(135deg, #F97316, #FFC21A)",
          color: open ? "var(--text-secondary)" : "#fff",
          border: open ? "1px solid var(--border)" : "none",
          borderRadius: "50px",
          padding: "11px 20px",
          fontSize: "13px",
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: "pointer",
          boxShadow: open ? "none" : "0 4px 18px rgba(249,115,22,0.4)",
          transition: "all 0.2s ease",
          letterSpacing: "0.01em",
        }}
        onMouseEnter={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        }}
      >
        {open ? <X size={16} /> : <Bot size={16} />}
        {open ? "Close" : title}
      </button>
    </>,
    document.body
  );
}
