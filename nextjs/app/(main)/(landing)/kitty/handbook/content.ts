import { BarChart3, Map, MapPinned, Rocket, UserCog } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── KeptCarbon Handbook content ─────────────────────────────────────────
   Groups → articles → steps. The sidebar, breadcrumb, stepper, and
   prev/next buttons are all built from this list, so adding an article or
   a step here is all a new page needs.

   The outline follows the platform's real features; steps are still empty
   (the page shows "เนื้อหากำลังจัดทำ") until the content is written. */

export type HandbookStep = {
  /** Short label shown in the stepper, e.g. "เลือกเมนู". */
  title: string;
  description: string;
  /** Screenshot under /public, e.g. "/assets/img/kitty/handbook/draw-plot-1.png". */
  image?: string;
};

export type HandbookArticle = {
  /** URL segment: /kitty/handbook/<slug>. Must be unique across all groups. */
  slug: string;
  title: string;
  description: string;
  steps: HandbookStep[];
};

export type HandbookGroup = {
  title: string;
  icon: LucideIcon;
  articles: HandbookArticle[];
};

export const handbookGroups: HandbookGroup[] = [
  {
    title: "เริ่มต้นใช้งาน",
    icon: Rocket,
    articles: [
      {
        slug: "register-login",
        title: "สมัครสมาชิกและเข้าสู่ระบบ",
        description: "วิธีสร้างบัญชีผู้ใช้และเข้าสู่ระบบ KeptCarbon",
        steps: [],
      },
      {
        slug: "navigation",
        title: "ภาพรวมเมนูของระบบ",
        description: "ทำความรู้จักเมนูหลักและหน้าต่าง ๆ ของ KeptCarbon",
        steps: [],
      },
    ],
  },
  {
    title: "การประเมินคาร์บอน",
    icon: Map,
    articles: [
      {
        slug: "draw-plot",
        title: "วาดแปลง",
        description: "วิธีวาดขอบเขตแปลงบนแผนที่ในระบบ KeptCarbon",
        steps: [],
      },
      {
        slug: "plot-info",
        title: "บันทึกข้อมูลแปลง",
        description: "กรอกข้อมูลแปลงยางพาราเพื่อใช้ในการประเมินคาร์บอน",
        steps: [],
      },
      {
        slug: "assessment-result",
        title: "ดูผลการประเมินคาร์บอน",
        description: "อ่านผลการประเมินปริมาณคาร์บอนกักเก็บของแปลง",
        steps: [],
      },
    ],
  },
  {
    title: "การจัดการแปลง",
    icon: MapPinned,
    articles: [
      {
        slug: "my-plots",
        title: "แปลงของฉัน",
        description: "ดู แก้ไข และจัดการโครงการและแปลงที่บันทึกไว้",
        steps: [],
      },
    ],
  },
  {
    title: "แดชบอร์ด",
    icon: BarChart3,
    articles: [
      {
        slug: "carbon-stock-dashboard",
        title: "ศักยภาพคาร์บอนสะสม",
        description: "ดูภาพรวมศักยภาพคาร์บอนสะสมในแต่ละพื้นที่",
        steps: [],
      },
      {
        slug: "simulation-dashboard",
        title: "จำลองคาร์บอนกักเก็บ",
        description: "จำลองปริมาณคาร์บอนกักเก็บและรายได้ในอนาคต",
        steps: [],
      },
    ],
  },
  {
    title: "บัญชีผู้ใช้",
    icon: UserCog,
    articles: [
      {
        slug: "profile",
        title: "จัดการโปรไฟล์",
        description: "แก้ไขข้อมูลส่วนตัวและการตั้งค่าบัญชีผู้ใช้",
        steps: [],
      },
    ],
  },
];

/* ── Lookups ─────────────────────────────────────────────────────────── */
export type ArticleLink = { slug: string; title: string };

const flat = handbookGroups.flatMap((group) =>
  group.articles.map((article) => ({ group, article }))
);

export const firstArticleSlug = flat[0].article.slug;

export function allArticleSlugs() {
  return flat.map(({ article }) => article.slug);
}

/** The article, its group, its number within the group, and its
    neighbours in reading order (across group boundaries). */
export function findArticle(slug: string) {
  const i = flat.findIndex(({ article }) => article.slug === slug);
  if (i === -1) return null;
  const { group, article } = flat[i];
  const toLink = (j: number): ArticleLink | null =>
    flat[j] ? { slug: flat[j].article.slug, title: flat[j].article.title } : null;
  return {
    group,
    article,
    number: group.articles.indexOf(article) + 1,
    prev: toLink(i - 1),
    next: toLink(i + 1),
  };
}
