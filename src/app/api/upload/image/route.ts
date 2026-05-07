import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "Image upload not configured — BLOB_READ_WRITE_TOKEN is missing. Enable Vercel Blob storage in the Vercel dashboard and add the token to your environment variables." }, { status: 503 });
  }

  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const type = form.get("type") as string | null;
  const id = form.get("id") as string | null;

  if (!file || !type || !id) return Response.json({ error: "Missing file, type, or id" }, { status: 400 });
  if (!["host", "brand"].includes(type)) return Response.json({ error: "Invalid type" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return Response.json({ error: "Only JPEG, PNG, WebP, and GIF images are allowed" }, { status: 400 });
  if (file.size > MAX_SIZE_BYTES) return Response.json({ error: "File too large (max 5 MB)" }, { status: 400 });

  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${type}-${id}-${Date.now()}.${ext}`;

  const blob = await put(filename, file, { access: "public" });

  if (type === "host") {
    await prisma.liveHost.update({ where: { id }, data: { avatarUrl: blob.url } });
  } else {
    await prisma.brand.update({ where: { id }, data: { logoUrl: blob.url } });
  }

  return Response.json({ ok: true, url: blob.url });
}
