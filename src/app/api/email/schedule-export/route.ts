import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { start, end } = await req.json();

  const clients = await prisma.client.findMany({
    include: { user: true, brands: { include: { sessions: { where: { scheduledStart: { gte: new Date(start), lte: new Date(end) } }, include: { room: true, liveHost: { include: { user: true } } }, orderBy: { scheduledStart: "asc" } } } } },
  });

  const activeClients = clients.filter((c) => c.brands.some((b) => b.sessions.length > 0));
  if (activeClients.length === 0) return Response.json({ ok: true, count: 0 });

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  let sent = 0;
  for (const client of activeClients) {
    const brandSessions = client.brands.flatMap((b) =>
      b.sessions.map((s) => ({ ...s, brandName: b.name }))
    ).sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());

    const rows = brandSessions.map((s) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${format(new Date(s.scheduledStart), "dd MMM yyyy")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${format(new Date(s.scheduledStart), "HH:mm")} – ${format(new Date(s.scheduledEnd), "HH:mm")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${s.brandName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${s.liveHost?.user.name ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${s.room?.name ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${(s as { platform: string }).platform}</td>
      </tr>`).join("");

    const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:700px;margin:0 auto;">
      <div style="background:#4f46e5;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">📅 Livestream Schedule</h1>
        <p style="color:#c7d2fe;margin:4px 0 0;">
          ${format(new Date(start), "d MMM")} – ${format(new Date(end), "d MMM yyyy")}
        </p>
      </div>
      <div style="padding:24px 32px;background:#fff;border:1px solid #e2e8f0;border-top:none;">
        <p style="color:#475569;margin-bottom:20px;">Dear ${client.user.name},<br>Here is your upcoming livestream schedule from 13 Media.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Date</th>
              <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Time</th>
              <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Brand</th>
              <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Host</th>
              <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Room</th>
              <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Platform</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="padding:16px 32px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;font-size:12px;color:#94a3b8;">
        Sent by 13 Media Livestream Manager · <a href="${process.env.NEXTAUTH_URL}" style="color:#6366f1;">View online</a>
      </div>
    </div>`;

    try {
      await transporter.sendMail({
        from: `"13 Media" <${process.env.SMTP_USER}>`,
        to: client.user.email,
        subject: `Your Livestream Schedule — ${format(new Date(start), "MMM yyyy")}`,
        html,
      });
      sent++;
    } catch (e) {
      console.error("Email send error:", e);
    }
  }

  return Response.json({ ok: true, count: sent });
}
