import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { IntelligenceDashboard } from "@/components/intelligence/IntelligenceDashboard";

export default async function ClientBrandIntelligencePage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "CLIENT") redirect("/");

  return (
    <IntelligenceDashboard
      scope="CLIENT"
      title="AI Analysis"
      subtitle="Diagnostic insights for your brands"
    />
  );
}
