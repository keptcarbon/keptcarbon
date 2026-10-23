import { parseInline } from "./content";
import type { InlineNode } from "./content";

/* Text with its inline formatting shown — **ตัวหนา**, *ตัวเอียง*,
   __ขีดเส้นใต้__ and [ข้อความ](https://…) links (new tab). Built as React
   elements — the text is never inserted as HTML — and only http(s) URLs
   become links (see parseInline / linkHref). */
export default function InlineText({ text }: { text: string }) {
  return <>{render(parseInline(text))}</>;
}

function render(nodes: InlineNode[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    if (typeof node === "string") return node;
    const children = render(node.children);
    switch (node.kind) {
      case "b":
        return <strong key={i} className="font-bold">{children}</strong>;
      case "i":
        return <em key={i} className="italic">{children}</em>;
      case "u":
        // Plain-coloured underline, so it doesn't read as a (green) link.
        return <u key={i} className="underline decoration-foreground/50 underline-offset-2">{children}</u>;
      case "link":
        return (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
          >
            {children}
            <span className="sr-only"> (เปิดในแท็บใหม่)</span>
          </a>
        );
    }
  });
}
