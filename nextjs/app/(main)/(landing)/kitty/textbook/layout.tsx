import { BookOpen } from "lucide-react";
import { getPublishedOutline } from "@/lib/kitty-book";
import TextbookNav, { TextbookMobileNav } from "./TextbookNav";

/* Read per request, so edits on /rnd/kitty-content show up at once. */
export const dynamic = "force-dynamic";

/* Sidebar table of contents + lesson. Below lg the sidebar folds into a
   toggle above the lesson. */
export default async function TextbookLayout({ children }: { children: React.ReactNode }) {
  const outline = await getPublishedOutline("textbook");
  return (
    <div className="kc-tw bg-muted/60 pt-16">
      <div className="mx-auto flex max-w-9xl">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-80 shrink-0 overflow-y-auto border-r border-border bg-card px-4 py-6 lg:block">
          <h2 className="mt-0 mb-4 flex items-center gap-2.5 px-1 text-lg font-bold text-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
            สารบัญ
          </h2>
          <TextbookNav outline={outline} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 md:py-10 lg:px-10">
          <TextbookMobileNav outline={outline} />
          {children}
        </main>
      </div>
    </div>
  );
}
