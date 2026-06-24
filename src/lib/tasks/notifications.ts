import { prisma } from "@/lib/prisma";
import { createId } from "./id";

export async function createNotification({
  userId,
  type,
  title,
  message,
  taskId,
}: {
  userId: string;
  type: string;
  title: string;
  message: string;
  taskId?: string | null;
}) {
  try {
    await prisma.notification.create({
      data: { id: createId(), userId, type, title, message, taskId: taskId ?? null },
    });
  } catch {
    // Non-fatal
  }
}
