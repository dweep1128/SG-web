import Image from "next/image";
import type { Part } from "@/lib/catalog-types";
import { CARD_IMAGE_WIDTH, cld } from "@/lib/cloudinary";
import { CategoryIcon } from "./category-icon";

// Fixed 4:3 frame so a photo drops in with zero layout shift. Cloudinary does the resizing/format (f_auto,q_auto),
// so next/image optimisation is skipped rather than done twice.
export function PartImage({ part, width = CARD_IMAGE_WIDTH, sizes = "(max-width: 640px) 50vw, 280px", priority = false }: { part: Pick<Part, "sku" | "name" | "imageUrl"> & { cat?: Part["cat"] }; width?: number; sizes?: string; priority?: boolean }) {
  return (
    <div className="part-image">
      {part.imageUrl ? (
        <Image src={cld(part.imageUrl, width)} alt={part.name} fill sizes={sizes} priority={priority} unoptimized className="part-image__photo" />
      ) : (
        <div className="part-image__placeholder" role="img" aria-label={`No photo yet for ${part.name}`}>
          {part.cat && <CategoryIcon cat={part.cat} size={36} />}
          <span className="part-image__code">#{part.sku}</span>
        </div>
      )}
    </div>
  );
}
