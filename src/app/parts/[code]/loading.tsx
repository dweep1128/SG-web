import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="shell page" role="status" aria-label="Loading part">
      <Skeleton width="40%" height={14} />
      <div className="detail loading__detail">
        <div className="skeleton" style={{ aspectRatio: "4 / 3" }} />
        <div className="detail__info">
          <Skeleton width="30%" height={22} />
          <Skeleton width="90%" height={40} />
          <Skeleton width="50%" height={36} />
          <Skeleton height={180} />
          <Skeleton height={52} />
        </div>
      </div>
    </div>
  );
}
