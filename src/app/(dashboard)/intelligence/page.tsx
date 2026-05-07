import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { IntelligenceDashboard } from "@/components/intelligence/IntelligenceDashboard";

export default async function IntelligencePage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  return (
    <IntelligenceDashboard
      scope="ADMIN"
      title="AI Analysis"
      subtitle="Diagnostic insights across the agency"
    />
  );
}
