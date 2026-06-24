import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TaskPanel } from "@/components/tasks/TaskPanel";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session.user as { id: string; name?: string; role: string };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={user.role} userName={user.name || "User"} />
      <main className="flex-1 overflow-y-auto relative">
        <div className="p-4 pt-[72px] lg:p-8 lg:pt-8 max-w-[1440px] mx-auto animate-in">
          {children}
        </div>
      </main>
      <TaskPanel userId={user.id} userRole={user.role} />
    </div>
  );
}
