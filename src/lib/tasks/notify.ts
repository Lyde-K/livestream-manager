import nodemailer from "nodemailer";

interface TaskNotifyPayload {
  assigneeName: string;
  assigneeEmail: string;
  taskTitle: string;
  taskId: string;
  dueDate?: Date | null;
  priority: string;
  assignerName: string;
}

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high:   "#f97316",
  medium: "#f59e0b",
  low:    "#64748b",
};

export async function sendTaskAssignmentEmail(payload: TaskNotifyPayload) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const taskUrl = `${appUrl}/tasks/${payload.taskId}`;
  const dueLine = payload.dueDate
    ? `<p style="margin:0 0 8px;"><strong>Due:</strong> ${new Date(payload.dueDate).toLocaleDateString("en-MY", { dateStyle: "long" })}</p>`
    : "";
  const pColor = PRIORITY_COLORS[payload.priority] ?? "#64748b";

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#F97316,#FFC21A);padding:20px 24px;">
        <p style="margin:0;color:#fff;font-size:14px;font-weight:600;">13 Media — Task Assignment</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;color:#07111F;">Hi ${payload.assigneeName},</p>
        <p style="margin:0 0 16px;color:#475569;">${payload.assignerName} has assigned you a task:</p>
        <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:0 0 16px;border-left:4px solid ${pColor};">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#07111F;">${payload.taskTitle}</p>
          ${dueLine}
          <p style="margin:0;"><span style="background:${pColor};color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;text-transform:uppercase;">${payload.priority}</span></p>
        </div>
        <a href="${taskUrl}" style="display:inline-block;background:#1677FF;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">View Task →</a>
      </div>
    </div>
  `;

  try {
    await transporter().sendMail({
      from: `"13 Media" <${process.env.SMTP_USER}>`,
      to: payload.assigneeEmail,
      subject: `Task assigned: ${payload.taskTitle}`,
      html,
    });
  } catch {
    // Non-fatal — task is created regardless of email delivery
  }
}
