/**
 * A rung body with its visuals: markdown runs interleaved with model-drawn
 * visuals and verified images at their [[visual:slug]] / [[image:slug]]
 * markers. A marker with no matching stored visual or verified image renders
 * nothing — that is how a rejected image degrades. The stored body is never
 * rewritten here.
 */
import { Markdown } from "@/components/Markdown";
import { segmentBody, type Visual } from "@/lib/atlas/visuals";
import { AtlasImage, type AtlasImageData } from "./AtlasImage";
import { AtlasVisual } from "./AtlasVisual";

const parseVisuals = (visualsJson: string | null): Visual[] => {
  if (!visualsJson) return [];
  try {
    const parsed: unknown = JSON.parse(visualsJson);
    return Array.isArray(parsed) ? (parsed as Visual[]) : [];
  } catch {
    return [];
  }
};

export const RungBody = ({
  md,
  visualsJson,
  images,
}: {
  md: string;
  visualsJson: string | null;
  images: AtlasImageData[];
}) => {
  const visuals = new Map(parseVisuals(visualsJson).map((v) => [v.slug, v]));
  const bySlug = new Map(images.map((i) => [i.slug, i]));
  return (
    <div className="space-y-4">
      {segmentBody(md).map((seg, i) => {
        if (seg.type === "md") return <Markdown key={i} md={seg.md} />;
        if (seg.type === "visual") {
          const v = visuals.get(seg.slug);
          return v ? <AtlasVisual key={i} visual={v} /> : null;
        }
        const img = bySlug.get(seg.slug);
        return img ? <AtlasImage key={i} image={img} /> : null;
      })}
    </div>
  );
};
