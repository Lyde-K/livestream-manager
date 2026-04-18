import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session.user as { name?: string; role: string };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <Sidebar role={user.role} userName={user.name || "User"} />
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg)" }}>
        {/* pt-14 on mobile to clear the fixed top bar; removed on lg */}
        <div className="p-4 pt-[72px] lg:p-6 lg:pt-6 max-w-[1400px] mx-auto animate-in">{children}</div>
      </main>
    </div>
  );
}
