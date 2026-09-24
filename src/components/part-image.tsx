import Image from "next/image";
import type { Part } from "@/lib/catalog-types";
import { CategoryIcon } from "./category-icon";

// Fixed 4:3 frame so a real photo (Cloudinary, later) drops in with zero layout shift.
export function PartImage({ part, sizes = "(max-width: 640px) 50vw, 280px", priority = false }: { part: Pick<Part, "code" | "name" | "cat" | "imageUrl">; sizes?: string; priority?: boolean }) {
  return (
    <div className="part-image">
      {part.imageUrl ? (
        <Image src={part.imageUrl} alt={part.name} fill sizes={sizes} priority={priority} className="part-image__photo" />
      ) : (
        <div className="part-image__placeholder" role="img" aria-label={`No photo yet for ${part.name}`}>
          <CategoryIcon cat={part.cat} size={36} />
          <span className="part-image__code">#{part.code}</span>
        </div>
      )}
    </div>
  );
}
