import type { Metadata } from "next";
import Image from "next/image";
import {
  Building2,
  Globe,
  Landmark,
  Leaf,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import ContactForm from "../ContactForm";
import Reveal from "./Reveal";

export const metadata: Metadata = {
  title: "เกี่ยวกับโครงการ | KeptCarbon",
  description:
    "โครงการวิจัยและพัฒนา KeptCarbon Platform — แพลตฟอร์มภูมิสารสนเทศและปัญญาประดิษฐ์เพื่อการจัดการสวนยางพาราอย่างยืดหยุ่นต่อการเปลี่ยนแปลงสภาพภูมิอากาศ",
};

const objectives = [
  {
    label: "Platform Development",
    heading: "พัฒนาและสาธิตระบบ KeptCarbon Platform",
    body: "ประยุกต์ใช้เทคโนโลยีภูมิสารสนเทศและปัญญาประดิษฐ์ เพื่อสร้างฐานข้อมูลสวนยางพารารายแปลง พร้อมฟังก์ชันการพยากรณ์อายุยางพารา การประเมินศักยภาพคาร์บอนเครดิต และการแสดงผลเชิงพื้นที่และเวลา สำหรับสนับสนุนการทำงานของเจ้าหน้าที่และหน่วยงานภาครัฐที่เกี่ยวข้อง",
  },
  {
    label: "Policy Decision Support",
    heading: "พัฒนาระบบสนับสนุนการตัดสินใจเชิงนโยบาย",
    body: "ใช้ข้อมูลคาดการณ์คาร์บอนเครดิตและโครงสร้างอายุยางพาราในหลายระดับพื้นที่ (รายแปลง–อำเภอ–จังหวัด–ภูมิภาค) เพื่อช่วยผู้กำหนดนโยบายจำลองสถานการณ์ วางแผน และบริหารจัดการสวนยางพาราอย่างยั่งยืน",
  },
  {
    label: "Training & Capacity Building",
    heading: "จัดทำคู่มือและระบบการฝึกอบรม",
    body: "เสริมศักยภาพการใช้งาน KeptCarbon Platform ให้กับเจ้าหน้าที่ภาครัฐและผู้กำหนดนโยบาย ในการสื่อสารและจูงใจเกษตรกรให้เข้าร่วมโครงการคาร์บอนเครดิตได้อย่างมีประสิทธิภาพ",
  },
] as const;

const teamLead = [
  {
    img: "team-1.jpg",
    role: "ที่ปรึกษาโครงการ",
    name: "รศ.ดร.สุเพชร จิรขจรกุล",
    desc: "คณะวิทยาศาสตร์และเทคโนโลยี",
    affil: "มหาวิทยาลัยธรรมศาสตร์",
  },
  {
    img: "team-2.jpg",
    role: "หัวหน้าโครงการ",
    name: "รศ.ดร.แสงดาว วงค์สาย",
    desc: "คณะวิทยาศาสตร์และเทคโนโลยี",
    affil: "มหาวิทยาลัยธรรมศาสตร์",
  },
] as const;

const teamMembers = [
  {
    img: "team-3.jpg",
    name: "ผศ.ดร. ชนิดา สุวรรณประสิทธิ์",
    desc: "คณะสังคมศาสตร์",
    affil: "มหาวิทยาลัยเชียงใหม่",
  },
  {
    img: "team-4.jpg",
    name: "ดร. นพชัย วงค์สาย",
    desc: "วิทยาลัยศิลปะ สื่อ และเทคโนโลยี",
    affil: "มหาวิทยาลัยเชียงใหม่",
  },
  {
    img: "team-5.jpg",
    name: "ผศ.ดร. ศักดิ์ดา หอมหวล",
    desc: "คณะสังคมศาสตร์",
    affil: "มหาวิทยาลัยเชียงใหม่",
  },
  {
    img: "team-6.jpg",
    name: "รศ.ดร. วีระพงค์ เกิดสิน",
    desc: "คณะเทคโนโลยีและสิ่งแวดล้อม",
    affil: "มหาวิทยาลัยสงขลานครินทร์",
  },
  {
    img: "team-7.jpg",
    name: "ดร. จุฑาพร เกษร",
    desc: "คณะเทคโนโลยีและสิ่งแวดล้อม",
    affil: "มหาวิทยาลัยสงขลานครินทร์",
  },
] as const;

const partnerAddresses = [
  {
    faculty: "คณะวิทยาศาสตร์และเทคโนโลยี",
    detail: "มหาวิทยาลัยธรรมศาสตร์ (ศูนย์รังสิต) อ.คลองหลวง จ.ปทุมธานี",
  },
  {
    faculty: "คณะสังคมศาสตร์",
    detail: "มหาวิทยาลัยเชียงใหม่ อ.เมือง จ.เชียงใหม่",
  },
  {
    faculty: "วิทยาลัยศิลปะ สื่อ และเทคโนโลยี",
    detail: "มหาวิทยาลัยเชียงใหม่ อ.เมือง จ.เชียงใหม่",
  },
  {
    faculty: "คณะเทคโนโลยีและสิ่งแวดล้อม",
    detail: "มหาวิทยาลัยสงขลานครินทร์ วิทยาเขตภูเก็ต อ.กะทู้ จ.ภูเก็ต",
  },
] as const;

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 className="mt-0 mb-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="m-0 text-base text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

function TeamCard({
  img,
  name,
  role,
  desc,
  affil,
}: {
  img: string;
  name: string;
  role: string;
  desc: string;
  affil: string;
}) {
  return (
    <div className="flex h-full flex-col items-center rounded-xl border border-border bg-card p-6 text-center transition-shadow duration-200 hover:shadow-md">
      <div className="mb-4 size-24 overflow-hidden rounded-full border border-border">
        <Image
          src={`/assets/img/team/${img}`}
          alt={name}
          width={192}
          height={192}
          className="size-full object-cover object-top"
        />
      </div>
      <div className="mb-1 text-xs font-medium text-primary">{role}</div>
      <div className="mb-2 text-sm font-semibold text-foreground md:text-base">
        {name}
      </div>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground md:text-sm">
        {desc}
        <br />
        {affil}
      </p>
    </div>
  );
}

export default function AboutProjectPage() {
  return (
    <div className="kc-tw bg-background">
      {/* ── Hero: header + About together fill one viewport ──────────── */}
      <div className="flex min-h-screen flex-col justify-center bg-gradient-to-b from-secondary/70 via-secondary/20 to-background">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <header className="flex flex-col items-center px-4 pt-32 pb-12 text-center sm:px-6 md:pt-44 md:pb-16 lg:px-8">
          <Reveal className="w-full">
            <span className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-secondary-foreground shadow-sm md:text-sm">
              <Landmark className="size-3.5" aria-hidden="true" />
              โครงการวิจัยและพัฒนา
            </span>
          </Reveal>
          <Reveal className="w-full" delay={90}>
            <h1 className="m-0 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
              เกี่ยวกับโครงการ <span className="text-primary">KeptCarbon</span>
            </h1>
          </Reveal>
          <Reveal className="w-full" delay={180}>
            <p className="mx-auto mt-5 mb-0 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              แพลตฟอร์มภูมิสารสนเทศและปัญญาประดิษฐ์
              เพื่อการจัดการสวนยางพาราอย่างยืดหยุ่นต่อการเปลี่ยนแปลงสภาพภูมิอากาศ
            </p>
          </Reveal>
          <Reveal className="mt-10 w-full max-w-2xl" delay={260}>
            <div className="h-px w-full bg-border" />
          </Reveal>
        </header>

        {/* ── About ───────────────────────────────────────────────────── */}
        <section id="about" className="scroll-mt-28 px-4 pb-16 sm:px-6 md:pb-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-4xl">
              <Reveal>
                <p className="mt-0 mb-5 text-base leading-relaxed text-foreground/90 md:text-lg">
                  โครงการวิจัยนี้พัฒนา <strong>KeptCarbon Platform</strong>{" "}
                  โดยใช้เทคโนโลยีภูมิสารสนเทศ (Geospatial) ร่วมกับปัญญาประดิษฐ์
                  (GeoAI) เพื่อพยากรณ์อายุยางพาราและประเมินศักยภาพคาร์บอนเครดิตในระดับรายแปลง
                  พร้อมนำเสนอข้อมูลเชิงพื้นที่และเวลาในรูปแบบที่เข้าใจง่าย
                  ช่วยให้เกษตรกรเห็นภาพรายได้ระยะยาว ลดความเสี่ยงในการตัดสินใจ
                  และสนับสนุนการสื่อสารเชิงนโยบายได้อย่างมีประสิทธิภาพ
                </p>
              </Reveal>

              {/* Meaning callout */}
              <Reveal delay={120} className="rounded-xl border border-border bg-secondary/40 p-6 md:p-8">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                  <Leaf className="size-4" aria-hidden="true" />
                  ความหมายของ KeptCarbon
                </div>
                <p className="m-0 text-sm leading-relaxed text-foreground/90 md:text-base">
                  <strong>KeptCarbon</strong> หมายถึง{" "}
                  <em>&ldquo;การเก็บและรักษาคาร์บอน&rdquo;</em>{" "}
                  สะท้อนแนวคิดการกักเก็บคาร์บอนในสวนยางพารา
                  การรักษามูลค่าทางเศรษฐกิจของคาร์บอนเครดิต
                  และการพัฒนาระบบข้อมูลที่ต่อเนื่องและยั่งยืน
                </p>
              </Reveal>
            </div>
          </div>
        </section>
      </div>

      {/* ── Objectives ──────────────────────────────────────────────── */}
      <section
        id="objectives"
        className="scroll-mt-28 border-y border-border bg-muted/60 px-4 py-16 sm:px-6 md:py-28 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeading
              title="วัตถุประสงค์"
              subtitle="สามเป้าหมายหลักของโครงการวิจัย KeptCarbon"
            />
          </Reveal>
          <Reveal delay={100}>
            <ol className="m-0 flex list-none flex-col p-0">
              {objectives.map(({ label, heading, body }, i) => (
                <li
                  key={label}
                  className="group grid grid-cols-1 gap-x-8 gap-y-4 border-border py-10 first:pt-0 last:pb-0 not-first:border-t md:grid-cols-12 md:items-center md:py-16"
                >
                  {/* Editorial watermark number */}
                  <div className="md:col-span-3">
                    <span className="block text-5xl font-bold leading-none tracking-tighter text-primary/15 tabular-nums md:text-8xl">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="md:col-span-9">
                    <span className="mb-3 inline-block text-xs font-semibold tracking-[0.2em] text-primary uppercase">
                      {label}
                    </span>
                    <h3 className="mt-0 mb-3 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                      {heading}
                    </h3>
                    <p className="m-0 max-w text-base leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* ── Partners ────────────────────────────────────────────────── */}
      <section id="partners" className="scroll-mt-28 px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeading title="หน่วยงานร่วมโครงการ" />
          </Reveal>
          <Reveal delay={100} className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="group flex items-center justify-center rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md"
              >
                <Image
                  src={`/assets/img/clients/client-${n}.png`}
                  alt={`หน่วยงานร่วมโครงการ ${n}`}
                  width={220}
                  height={120}
                  className="h-20 w-auto object-contain transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0 md:h-24"
                />
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── Team ────────────────────────────────────────────────────── */}
      <section
        id="team"
        className="scroll-mt-28 border-t border-border bg-muted/60 px-4 py-16 sm:px-6 md:py-24 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeading
              title="คณะผู้ปฏิบัติงานโครงการ"
              subtitle="คณะผู้ดำเนินงานจากสามมหาวิทยาลัยชั้นนำของประเทศ"
            />
          </Reveal>
          <Reveal delay={100} className="mx-auto mb-4 grid max-w-2xl grid-cols-2 gap-3 sm:gap-4">
            {teamLead.map((m) => (
              <TeamCard key={m.img} {...m} />
            ))}
          </Reveal>
          <Reveal delay={160} className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {teamMembers.map((m) => (
              <div
                key={m.img}
                className="basis-[calc(50%-0.375rem)] sm:basis-[calc(50%-0.5rem)] lg:basis-[calc(33.333%-0.667rem)]"
              >
                <TeamCard role="ผู้ร่วมโครงการ" {...m} />
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── Contact ─────────────────────────────────────────────────── */}
      <section id="contact" className="scroll-mt-28 border-t border-border px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeading
              title="ติดต่อเรา"
              subtitle="สามารถติดต่อพวกเราได้ที่"
            />
          </Reveal>

          <Reveal delay={100} className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            {/* KeptCarbon Project */}
            <div className="rounded-xl border border-border bg-card p-6 md:p-8">
              <div className="mb-6 flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Building2 className="size-4.5" aria-hidden="true" />
                </span>
                <h3 className="m-0 text-base font-semibold text-foreground md:text-lg">
                  โครงการวิจัย KeptCarbon
                </h3>
              </div>

              <div className="mb-4 flex items-stretch gap-2.5">
                <div className="flex shrink-0 flex-col items-center">
                  <MapPin
                    className="mt-0.5 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="my-2 w-px flex-1 bg-border" />
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium text-foreground">
                    ที่อยู่หน่วยงาน
                  </div>
                  <ol className="m-0 flex list-none flex-col gap-2 p-0">
                    {partnerAddresses.map(({ faculty, detail }) => (
                      <li key={faculty} className="text-sm leading-relaxed">
                        <span className="block font-medium text-foreground/90">
                          {faculty}
                        </span>
                        <span className="block text-muted-foreground">
                          {detail}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="flex items-center gap-2.5 border-t border-border pt-4">
                <Mail
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <a
                  href="mailto:keptcarbon@gmail.com"
                  className="text-sm font-medium text-primary no-underline hover:underline"
                >
                  keptcarbon@gmail.com
                </a>
              </div>
            </div>

            {/* EnGRIDs Developer */}
            <div className="flex h-full flex-col rounded-xl border border-border bg-card p-6 md:p-8">
              <div className="mb-6 flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Globe className="size-4.5" aria-hidden="true" />
                </span>
                <h3 className="m-0 text-base font-semibold text-foreground md:text-lg">
                  ผู้พัฒนาระบบ EnGRIDs and turnPROx
                </h3>
              </div>

              <div className="grid grow grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                {/* EnGRIDs */}
                <div className="flex h-full flex-col">
                  <div className="text-sm font-semibold tracking-wide text-primary">
                    EnGRIDs
                  </div>
                  <div className="mt-2 mb-4 flex items-start gap-2.5">
                    <MapPin
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                      สตูดิโอวิจัยและพัฒนานวัตกรรมเชิงพื้นที่ด้านสิ่งแวดล้อม
                      <br />
                      ภาควิชาภูมิศาสตร์ คณะสังคมศาสตร์
                      <br />
                      มหาวิทยาลัยเชียงใหม่ อ.เมือง จ.เชียงใหม่ 50200
                    </p>
                  </div>
                  <div className="mt-auto flex flex-col gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Phone
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <a
                        href="tel:053943526"
                        className="text-sm font-medium break-all text-primary no-underline hover:underline"
                      >
                        053-943526
                      </a>
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Mail
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <a
                        href="mailto:engrids2025@gmail.com"
                        className="text-sm font-medium break-all text-primary no-underline hover:underline"
                      >
                        engrids2025@gmail.com
                      </a>
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Globe
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <a
                        href="https://engrids.soc.cmu.ac.th/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium break-all text-primary no-underline hover:underline"
                      >
                        engrids.soc.cmu.ac.th
                      </a>
                    </div>
                  </div>
                </div>

                {/* turnPROx */}
                <div className="flex h-full flex-col border-t border-border pt-5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
                  <div className="text-sm font-semibold tracking-wide text-primary">
                    turnPROx
                  </div>
                  <div className="mt-2 mb-4 flex items-start gap-2.5">
                    <MapPin
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                      239 ถนนห้วยแก้ว ตำบลสุเทพ อำเภอเมืองเชียงใหม่
                      <br />
                      จังหวัดเชียงใหม่ 50200
                    </p>
                  </div>
                  <div className="mt-auto flex flex-col gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Phone
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <a
                        href="tel:0654158248"
                        className="text-sm font-medium break-all text-primary no-underline hover:underline"
                      >
                        065-415-8248
                      </a>
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Mail
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <a
                        href="mailto:admin@turnpro@gmail.com"
                        className="text-sm font-medium break-all text-primary no-underline hover:underline"
                      >
                        admin@turnpro@gmail.com
                      </a>
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Globe
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <a
                        href="https://turnpro.dev/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium break-all text-primary no-underline hover:underline"
                      >
                        turnpro.dev
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Send Message Form (existing client component, legacy-styled) */}
          <ContactForm />
        </div>
      </section>
    </div>
  );
}
