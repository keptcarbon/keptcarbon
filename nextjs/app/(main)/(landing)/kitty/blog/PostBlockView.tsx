import Image from "next/image";
import { ArrowUpRight, Link2 } from "lucide-react";
import { quoteAccent } from "./content";
import InlineText from "./InlineText";
import type { PostBlock } from "./content";

/* One body block of a Keppy Blog post, handbook page or textbook lesson —
   shared by the public pages and the editors' previews on
   /rnd/kitty-content, so all of them look the same.
   `unoptimized` on images lets the editor preview local files (blob: URLs).
   Text: wrap-anywhere breaks long unbroken strings (URLs, repeated
   characters) instead of overflowing; pre-line keeps the author's Enter
   line breaks in paragraphs and quotes. [ข้อความ](https://…) in paragraphs,
   headings, list items and quotes becomes a link (InlineText). */
export default function PostBlockView({ block }: { block: PostBlock }) {
  switch (block.type) {
    case "heading":
      return block.level === 3 ? (
        <h3 className="mt-8 mb-3 text-lg font-bold tracking-tight text-foreground wrap-anywhere md:text-xl">
          <InlineText text={block.text} />
        </h3>
      ) : (
        <h2 className="mt-10 mb-4 text-xl font-bold tracking-tight text-foreground wrap-anywhere md:text-2xl">
          <InlineText text={block.text} />
        </h2>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          className={`mt-0 mb-6 flex flex-col gap-2 pl-7 text-base leading-loose text-foreground/90 wrap-anywhere marker:font-semibold marker:text-primary ${block.ordered ? "list-decimal" : "list-disc"}`}
        >
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              <InlineText text={item} />
            </li>
          ))}
        </ListTag>
      );
    }
    case "quote":
    case "quote-green":
    case "quote-blue":
    case "quote-amber":
    case "quote-red":
    case "quote-yellow": {
      const { color } = quoteAccent(block.type);
      return (
        <blockquote
          className="my-8 rounded-r-xl border-l-4 px-6 py-5 text-base leading-relaxed font-medium whitespace-pre-line text-foreground wrap-anywhere md:px-8"
          style={{ borderLeftColor: color, backgroundColor: `color-mix(in srgb, ${color} 10%, white)` }}
        >
          “<InlineText text={block.text} />”
        </blockquote>
      );
    }
    case "link": {
      const host = (() => {
        try {
          return new URL(block.url).hostname.replace(/^www\./, "");
        } catch {
          return block.url;
        }
      })();
      return (
        <p className="my-6">
          <a
            href={block.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 no-underline transition-colors hover:border-primary/30 hover:bg-secondary/50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Link2 className="size-4" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-primary group-hover:underline">
                {block.text || block.url}
              </span>
              <span className="truncate text-xs text-muted-foreground">{host}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
            <span className="sr-only">(เปิดในแท็บใหม่)</span>
          </a>
        </p>
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
            <figcaption className="mt-2 text-center text-xs text-muted-foreground wrap-anywhere">{block.caption}</figcaption>
          ) : null}
        </figure>
      );
    default:
      return <p className="mt-0 mb-4 text-base leading-loose whitespace-pre-line text-foreground/90 wrap-anywhere"><InlineText text={block.text} /></p>;
  }
}
