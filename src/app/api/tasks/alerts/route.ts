import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string };

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Single query: tasks assigned to me that are in_review OR overdue/due-today
  const tasks = await prisma.task.findMany({
    where: {
      assignees: { some: { userId: user.id } },
      status: { not: "done" },
      OR: [
        { status: "in_review" },
        { dueDate: { lte: todayEnd } },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      team: { select: { id: true, name: true } },
    },
  });

  return Response.json({ tasks });
}
