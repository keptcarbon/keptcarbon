import { BookOpen } from "lucide-react";
import TextbookNav, { TextbookMobileNav } from "./TextbookNav";

/* Sidebar table of contents + lesson. Below lg the sidebar folds into a
   toggle above the lesson. */
export default function TextbookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kc-tw bg-muted/60 pt-16">
      <div className="mx-auto flex max-w-9xl">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-80 shrink-0 overflow-y-auto border-r border-border bg-card px-4 py-6 lg:block">
          <h2 className="mt-0 mb-4 flex items-center gap-2.5 px-1 text-lg font-bold text-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
            สารบัญ
          </h2>
          <TextbookNav />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 md:py-10 lg:px-10">
          <TextbookMobileNav />
          {children}
        </main>
      </div>
    </div>
  );
}
