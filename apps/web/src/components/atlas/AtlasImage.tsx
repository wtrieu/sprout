/**
 * A verified real image (always Wikimedia Commons, never generated art),
 * with its attribution linking back to the file's description page.
 */
export type AtlasImageData = {
  id: number;
  slug: string;
  query: string;
  caption: string | null;
  url: string | null;
  thumbUrl: string | null;
  descUrl: string | null;
  author: string | null;
  license: string | null;
  width: number | null;
  height: number | null;
};

export const AtlasImage = ({ image }: { image: AtlasImageData }) => {
  const src = image.thumbUrl ?? image.url;
  if (!src) return null;
  const attribution = [image.author, image.license, "Wikimedia Commons"].filter(Boolean).join(" · ");
  return (
    <figure className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
      {/* Hotlinked Commons thumb on a self-hosted app; next/image has nothing to add. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={image.caption ?? image.query}
        loading="lazy"
        className="w-full"
        style={
          image.width && image.height ? { aspectRatio: `${image.width} / ${image.height}` } : undefined
        }
      />
      <figcaption className="space-y-1 px-4 py-3">
        {image.caption && <p className="text-xs text-neutral-400">{image.caption}</p>}
        <p className="text-[11px] text-neutral-600">
          {image.descUrl ? (
            <a href={image.descUrl} target="_blank" rel="noreferrer" className="hover:text-neutral-400">
              {attribution}
            </a>
          ) : (
            attribution
          )}
        </p>
      </figcaption>
    </figure>
  );
};
