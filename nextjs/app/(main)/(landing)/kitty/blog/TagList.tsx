import Link from "next/link";

/* A post's tags as small "#tag" chips — on the blog cards (plain, at most
   `max` + "+N") and on the post page (each links to the blog list
   searching for that tag). */
export default function TagList({ tags, max, linked = false, className = "" }: {
  tags: string[] | undefined;
  max?: number;
  linked?: boolean;
  className?: string;
}) {
  if (!tags?.length) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const more = tags.length - shown.length;
  const chip =
    "inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground no-underline";

  return (
    <ul className={`m-0 flex list-none flex-wrap gap-1.5 p-0 ${className}`} aria-label="แท็ก">
      {shown.map((tag) => (
        <li key={tag}>
          {linked ? (
            <Link
              href={`/kitty/blog/?q=${encodeURIComponent(tag)}`}
              className={`${chip} transition-colors hover:border-primary/30 hover:bg-secondary hover:text-primary`}
            >
              #{tag}
            </Link>
          ) : (
            <span className={chip}>#{tag}</span>
          )}
        </li>
      ))}
      {more > 0 && (
        <li>
          <span className={chip}>+{more}</span>
        </li>
      )}
    </ul>
  );
}
