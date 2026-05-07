"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.ok) { window.location.href = "/"; }
    else setError("Invalid email or password");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 1200px 800px at 20% 10%, rgba(22,119,255,.18), transparent 55%)," +
          "radial-gradient(ellipse 1000px 700px at 85% 90%, rgba(99,102,241,.14), transparent 55%)," +
          "radial-gradient(ellipse 700px 500px at 50% 50%, rgba(255,194,26,.05), transparent 60%)," +
          "linear-gradient(180deg, #07111F 0%, #050B16 100%)",
      }}
    >
      <div className="relative w-full max-w-[400px] mx-4">
        {/* Brand mark */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/13media-logo.png" alt="13 Media" className="h-14 w-auto mx-auto object-contain" />
          <p className="text-[12px] mt-3 uppercase tracking-[.2em] font-semibold" style={{ color: "rgba(148,163,184,.7)" }}>
            Analytics Platform
          </p>
        </div>

        {/* Glass card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(13, 27, 48, 0.55)",
            backdropFilter: "blur(28px) saturate(140%)",
            WebkitBackdropFilter: "blur(28px) saturate(140%)",
            border: "1px solid rgba(255,255,255,.08)",
            boxShadow: "0 24px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(22,119,255,.05) inset",
          }}
        >
          <form onSubmit={handleSubmit} className="px-7 py-7 space-y-5">
            <div>
              <h1 className="text-[20px] font-bold tracking-tight text-white">Welcome back</h1>
              <p className="text-[13px] mt-1" style={{ color: "rgba(148,163,184,.85)" }}>
                Sign in to your 13 Media workspace
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold mb-2 uppercase tracking-[.1em]" style={{ color: "rgba(148,163,184,.7)" }}>Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@13media.co" required autoFocus
                  className="w-full px-3.5 py-2.5 rounded-lg text-[14px] focus:outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.10)",
                    color: "#fff",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#1677FF"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(22,119,255,.18)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.10)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-2 uppercase tracking-[.1em]" style={{ color: "rgba(148,163,184,.7)" }}>Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    className="w-full px-3.5 py-2.5 rounded-lg text-[14px] focus:outline-none pr-10 transition-all"
                    style={{
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid rgba(255,255,255,.10)",
                      color: "#fff",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#1677FF"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(22,119,255,.18)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.10)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-opacity hover:opacity-100"
                    style={{ color: "rgba(148,163,184,.6)" }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg px-3.5 py-2.5 text-[13px] font-medium"
                style={{ background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.3)", color: "#FCA5A5" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg font-semibold text-[14px] transition-all cursor-pointer disabled:opacity-70 hover:brightness-110 active:brightness-95"
              style={{
                background: "#FFC21A",
                color: "#0A1424",
                boxShadow: "0 1px 0 rgba(255,255,255,.25) inset, 0 8px 24px rgba(255,194,26,.28)",
              }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-[12px]" style={{ color: "rgba(148,163,184,.45)" }}>
          Contact your admin to request access
        </p>
      </div>
    </div>
  );
}
