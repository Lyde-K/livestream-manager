import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: "sm" | "md" | "lg" | "full";
}

export function Skeleton({ className, rounded = "md", ...props }: SkeletonProps) {
  const radiusMap = { sm: "rounded-md", md: "rounded-lg", lg: "rounded-xl", full: "rounded-full" };
  return <div className={cn("skeleton", radiusMap[rounded], className)} {...props} />;
}
