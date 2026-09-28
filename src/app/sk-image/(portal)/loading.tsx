import { PartGridSkeleton } from "@/components/part-card";
import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="shell page" role="status" aria-label="Loading">
      <Skeleton width="50%" height={40} className="loading__title" />
      <Skeleton height={60} className="loading__title" />
      <PartGridSkeleton />
    </div>
  );
}
