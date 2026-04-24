import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/admin/sessions/clear-synced
 *
 * Permanently deletes ALL sessions that were imported from Google Sheets
 * (identified by externalRef starting with "GS-").
 *
 * Intended for use before a full resync to wipe stale / duplicate data.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  // Safety: require explicit confirmation header to prevent accidental calls
  const confirm = req.headers.get("x-confirm-clear");
  if (confirm !== "yes-delete-all-synced")
    return Response.json({ error: "Missing confirmation header" }, { status: 400 });

  const { count } = await prisma.session.deleteMany({
    where: { externalRef: { startsWith: "GS-" } },
  });

  return Response.json({ ok: true, deleted: count });
}

/**
 * GET /api/admin/sessions/clear-synced
 * Returns the count of GS-synced sessions without deleting.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const count = await prisma.session.count({
    where: { externalRef: { startsWith: "GS-" } },
  });

  return Response.json({ count });
}
