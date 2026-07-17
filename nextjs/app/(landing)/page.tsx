import Link from "next/link";
import { Cpu, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const highlights = [
  {
    icon: MapPin,
    title: "ระบุพิกัดแปลง",
    description:
      "วิเคราะห์พื้นที่ปลูกยางพาราอย่างแม่นยำด้วยเทคโนโลยี GeoAI",
  },
  {
    icon: Cpu,
    title: "ประมวลผลมวลชีวภาพ",
    description:
      "คำนวณการกักเก็บคาร์บอนด้วยโมเดลคณิตศาสตร์ที่ได้รับการรับรอง",
  },
  {
    icon: FileText,
    title: "ออกรายงานประเมิน",
    description:
      "สรุปผลลัพธ์เป็นรายงานที่เข้าใจง่าย พร้อมนำไปใช้งาน",
  },
] as const;

export default function Home() {
  return (
    <div className="kc-tw bg-background">
      {/* ── Section A: Hero ─────────────────────────────────────────── */}
      <section className="flex flex-col items-center px-4 pt-32 pb-16 text-center md:pt-48 md:pb-32">
        <span className="mb-6 inline-flex items-center rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-xs font-medium text-secondary-foreground md:text-sm">
          แพลตฟอร์มภูมิสารสนเทศและปัญญาประดิษฐ์ เพื่อสวนยางพาราไทย
        </span>

        <h1 className="m-0 text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl">
          Kept<span className="text-primary">Carbon</span>
        </h1>

        <p className="mx-auto mt-5 mb-0 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-xl">
          A GeoAI-Driven Platform for Climate-Resilient Rubber Plantation
          Management
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            nativeButton={false}
            render={<Link href="/map-draw" />}
            className="h-12 rounded-xl px-8 text-base font-semibold no-underline shadow-sm"
          >
            ประเมินคาร์บอน
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/about-project" />}
            variant="outline"
            className="h-12 rounded-xl px-8 text-base font-medium no-underline"
          >
            เกี่ยวกับโครงการ
          </Button>
        </div>
      </section>

      {/* ── Section B: Platform Highlights ──────────────────────────── */}
      <section className="border-t border-border bg-muted/50 px-4 py-16 md:py-24">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
            <h2 className="mt-0 mb-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              ครบทุกขั้นตอนในแพลตฟอร์มเดียว
            </h2>
            <p className="m-0 text-base text-muted-foreground">
              จากพิกัดแปลงปลูก สู่รายงานประเมินคาร์บอนเครดิต
              ด้วยเทคโนโลยีภูมิสารสนเทศและปัญญาประดิษฐ์
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-8">
            {highlights.map(({ icon: Icon, title, description }) => (
              <Card
                key={title}
                className="border border-border bg-card shadow-none ring-0 transition-shadow duration-200 hover:shadow-md [--card-spacing:--spacing(6)] md:[--card-spacing:--spacing(8)]"
              >
                <CardHeader>
                  <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg font-semibold text-foreground">
                    {title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="m-0 text-sm leading-relaxed text-muted-foreground md:text-base">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
