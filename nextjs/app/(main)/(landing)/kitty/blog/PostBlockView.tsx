import Image from "next/image";
import { quoteAccent } from "./content";
import type { PostBlock } from "./content";

/* One body block of a Keppy Blog post — shared by the public post page and
   the preview on /rnd/kitty-content/blog/new, so both look the same.
   `unoptimized` on images lets the editor preview local files (blob: URLs). */
export default function PostBlockView({ block }: { block: PostBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <h2 className="mt-10 mb-4 text-xl font-bold tracking-tight text-foreground md:text-2xl">
          {block.text}
        </h2>
      );
    case "quote":
    case "quote-green":
    case "quote-blue":
    case "quote-amber":
    case "quote-red":
    case "quote-yellow": {
      const { color } = quoteAccent(block.type);
      return (
        <blockquote
          className="my-8 rounded-r-xl border-l-4 px-6 py-5 text-base leading-relaxed font-medium text-foreground md:px-8"
          style={{ borderLeftColor: color, backgroundColor: `color-mix(in srgb, ${color} 10%, white)` }}
        >
          “{block.text}”
        </blockquote>
      );
    }
    case "image":
      return (
        <figure className="my-8">
          <Image
            src={block.src}
            alt={block.alt}
            width={1200}
            height={700}
            unoptimized
            className="h-auto w-full rounded-2xl border border-border"
          />
          {block.caption ? (
            <figcaption className="mt-2 text-center text-xs text-muted-foreground">{block.caption}</figcaption>
          ) : null}
        </figure>
      );
    default:
      return <p className="mt-0 mb-4 text-base leading-loose text-foreground/90">{block.text}</p>;
  }
}
