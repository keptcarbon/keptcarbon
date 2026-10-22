import HandbookNav, { HandbookMobileNav } from "./HandbookNav";

/* Sidebar table of contents + article. Below lg the sidebar folds into a
   toggle above the article. */
export default function HandbookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kc-tw bg-muted/60 pt-16">
      <div className="mx-auto flex max-w-9xl">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 overflow-y-auto border-r border-border bg-card px-4 py-6 lg:block">
          <h2 className="mt-0 mb-4 px-3 text-base font-bold text-foreground">คู่มือการใช้งานระบบ</h2>
          <HandbookNav />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 md:py-10 lg:px-10">
          <HandbookMobileNav />
          {children}
        </main>
      </div>
    </div>
  );
}
