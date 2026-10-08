import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = {
  title: "Kitty | KeptCarbon",
  description: "Kitty — โมดูลถ่ายทอดความรู้ของ KeptCarbon Platform",
};

/* Knowledge transfer module — placeholder until content is designed. */
export default function KittyPage() {
  return (
    <div className="kc-tw bg-background">
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-secondary/70 via-secondary/20 to-background px-4 pt-32 pb-16 text-center sm:px-6 md:pt-44 lg:px-8">
        <span className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-secondary-foreground shadow-sm md:text-sm">
          <GraduationCap className="size-3.5" aria-hidden="true" />
          ถ่ายทอดความรู้
        </span>
        <h1 className="m-0 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          <span className="text-primary">Kitty</span>
        </h1>
        <p className="mx-auto mt-5 mb-0 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          อยู่ระหว่างการพัฒนา
        </p>
      </div>
    </div>
  );
}
