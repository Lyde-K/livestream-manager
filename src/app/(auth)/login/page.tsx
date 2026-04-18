"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Radio, Eye, EyeOff } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0d0f18 0%, #1a1040 50%, #0d0f18 100%)" }}>
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }} />
      </div>

      <div className="relative w-full max-w-[380px] mx-4">
        {/* Card */}
        <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(255,255,255,.05)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,.1)" }}>
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", boxShadow: "0 8px 24px rgba(99,102,241,.4)" }}>
              <Radio size={26} className="text-white" />
            </div>
            <h1 className="text-[22px] font-bold text-white">13 Media</h1>
            <p className="text-[13px] mt-0.5" style={{ color: "rgba(255,255,255,.5)" }}>Livestream Manager</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
            <div>
              <label className="block text-[12px] font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "rgba(255,255,255,.5)" }}>Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@13media.co" required autoFocus
                className="w-full px-3.5 py-2.5 rounded-lg text-[13.5px] focus:outline-none"
                style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: "#fff" }}
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "rgba(255,255,255,.5)" }}>Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  className="w-full px-3.5 py-2.5 rounded-lg text-[13.5px] focus:outline-none pr-10"
                  style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: "#fff" }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: "rgba(255,255,255,.4)" }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg px-3.5 py-2.5 text-[13px] font-medium"
                style={{ background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", color: "#fca5a5" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg text-white font-semibold text-[14px] transition-opacity cursor-pointer disabled:opacity-70 mt-2"
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", boxShadow: "0 4px 16px rgba(99,102,241,.35)" }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center mt-5 text-[12px]" style={{ color: "rgba(255,255,255,.3)" }}>
          Contact your admin to request access
        </p>
      </div>
    </div>
  );
}
