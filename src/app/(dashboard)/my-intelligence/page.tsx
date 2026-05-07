import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { IntelligenceDashboard } from "@/components/intelligence/IntelligenceDashboard";

export default async function MyIntelligencePage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "LIVE_HOST") redirect("/");

  return (
    <IntelligenceDashboard
      scope="LIVE_HOST"
      title="AI Analysis"
      subtitle="Diagnostic insights for your sessions"
    />
  );
}
