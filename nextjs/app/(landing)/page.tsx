import Link from "next/link";
import {
  MapPin, Leaf,
  Clock, Target, BarChart3,
  Users, Building, ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { LazyVideo } from "@/components/ui/lazy-video";

const benefits = [
  {
    icon: Clock,
    title: "ประหยัดเวลาและต้นทุน",
    description:
      "ลดความจำเป็นในการลงพื้นที่สำรวจทุกต้นด้วยการวิเคราะห์ผ่านภาพถ่ายดาวเทียมและ AI",
  },
  {
    icon: Target,
    title: "ความแม่นยำระดับสูง",
    description:
      "อัลกอริทึม GeoAI ช่วยระบุขอบเขตและประเมินอายุยางพาราได้อย่างมีประสิทธิภาพ",
  },
  {
    icon: ShieldCheck,
    title: "ข้อมูลพร้อมใช้งาน",
    description:
      "รายงานผลการประเมินสอดคล้องกับมาตรฐาน รองรับการยื่นเอกสารในอนาคต",
  },
] as const;

const audiences = [
  {
    icon: Users,
    title: "เกษตรกรสวนยาง",
    description:
      "เพิ่มโอกาสในการสร้างรายได้เสริมจากการประเมินคาร์บอนเครดิตในพื้นที่เพาะปลูกของตนเอง",
  },
  {
    icon: Building,
    title: "หน่วยงานภาครัฐ",
    description:
      "เครื่องมือสนับสนุนการตัดสินใจเชิงนโยบายเพื่อเป้าหมาย Net Zero และการติดตามพื้นที่สีเขียว",
  },
  {
    icon: BarChart3,
    title: "ผู้ประเมินและองค์กร",
    description:
      "บริหารจัดการพอร์ตโฟลิโอคาร์บอนระดับภูมิภาคด้วยข้อมูลเชิงพื้นที่ที่วิเคราะห์ได้รวดเร็ว",
  },
] as const;

export default function Home() {
  return (
    <div className="kc-tw bg-background">
      {/* ── Section A: Hero ─────────────────────────────────────────── */}
      <section
        className="relative flex min-h-screen flex-col items-center justify-center px-4 pt-32 pb-16 text-center sm:px-6 md:pt-48 md:pb-32 lg:px-8 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/assets/img/hero-bg.webp')" }}
      >
        <div className="absolute inset-0 bg-black/60 z-0"></div>
        <div className="relative z-10 flex flex-col items-center">
          <span className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm md:text-sm">
            แพลตฟอร์มภูมิสารสนเทศและปัญญาประดิษฐ์ เพื่อสวนยางพาราไทย
          </span>

          <h1 className="m-0 text-5xl font-extrabold tracking-tighter drop-shadow-lg sm:text-6xl md:text-7xl">
            <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">Kept</span>
            <span className="bg-gradient-to-br from-emerald-300 to-emerald-500 bg-clip-text text-transparent">Carbon</span>
          </h1>

          <div className="mx-auto mt-6 mb-0 flex max-w-3xl flex-col gap-3 text-base leading-relaxed text-white drop-shadow md:text-xl">
            <p className="m-0 font-medium text-white/95">
              แพลตฟอร์มภูมิสารสนเทศและปัญญาประดิษฐ์
              <br className="hidden sm:block" />
              เพื่อการจัดการสวนยางพาราอย่างยืดหยุ่นต่อการเปลี่ยนแปลงสภาพภูมิอากาศ
            </p>
          </div>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Button
              nativeButton={false}
              render={<Link href="/map-draw" />}
              className="h-12 rounded-xl px-8 text-base font-semibold no-underline shadow-sm"
            >
              ประเมินคาร์บอน
            </Button>
          </div>
        </div>
      </section>

      {/* ── Section B: Platform Highlights ──────────────────────────── */}
      <section className="border-t border-border bg-muted/50 px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
            <h2 className="mt-0 mb-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              ครบทุกขั้นตอนในแพลตฟอร์มเดียว
            </h2>
            <p className="m-0 text-base text-muted-foreground">
              จากพิกัดแปลงปลูก สู่รายงานประเมินคาร์บอนเครดิต
              ด้วยเทคโนโลยีภูมิสารสนเทศและปัญญาประดิษฐ์
            </p>
          </div>

          <Reveal className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl ring-1 ring-emerald-900/5">
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-red-400/70" />
              <span className="size-2.5 rounded-full bg-amber-400/70" />
              <span className="size-2.5 rounded-full bg-emerald-400/70" />
              <div className="ml-3 flex items-center gap-1.5 rounded-md bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                <MapPin className="size-3 text-primary" aria-hidden="true" />
                keptcarbon.net/map-draw
              </div>
            </div>

            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              {/* ── Real product demo recording ──────────────────────── */}
              <LazyVideo
                className="absolute inset-0 size-full object-cover object-top"
                src="/assets/video/map-draw-demo.mp4"
                poster="/assets/video/map-draw-demo-poster.webp"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Section D: Benefits ─────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30 px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mt-0 mb-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              ทำไมต้องเลือก KeptCarbon?
            </h2>
            <p className="m-0 text-base text-muted-foreground">
              ยกระดับการจัดการคาร์บอนเครดิตด้วยเทคโนโลยีที่แม่นยำและเชื่อถือได้
            </p>
          </Reveal>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 md:gap-10">
            {benefits.map(({ icon: Icon, title, description }, i) => (
              <Reveal
                key={title}
                delay={i * 120}
                className="flex flex-col items-center px-2 text-center"
              >
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Icon className="size-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section E: CTA Banner ────────────────────────────────────── */}
      <section className="w-full border-t border-border bg-background px-4 py-16 text-center sm:px-6 md:py-24 lg:px-8">
        <Reveal className="mx-auto w-full max-w-4xl">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <Leaf className="size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-0 mb-3 text-3xl font-bold tracking-tight text-foreground md:text-3xl">
            พร้อมประเมินศักยภาพคาร์บอนเครดิตสวนยางของคุณหรือยัง?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-sm text-muted-foreground md:text-base">
            เริ่มต้นใช้งาน KeptCarbon Platform วันนี้ เพื่อเตรียมความพร้อมสู่ตลาดคาร์บอนเครดิตในอนาคต
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              nativeButton={false}
              render={<Link href="/map-draw" />}
              className="h-12 rounded-xl px-8 text-base font-semibold no-underline shadow-sm"
            >
              เริ่มประเมินคาร์บอนฟรี
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/about-project" />}
              variant="outline"
              className="h-12 rounded-xl px-8 text-base font-medium no-underline"
            >
              อ่านรายละเอียดเพิ่มเติม
            </Button>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
