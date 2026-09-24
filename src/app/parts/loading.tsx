import { PartGridSkeleton } from "@/components/part-card";
import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="shell page" role="status" aria-label="Loading">
      <Skeleton width="30%" height={14} />
      <Skeleton width="60%" height={44} className="loading__title" />
      <PartGridSkeleton />
    </div>
  );
}
