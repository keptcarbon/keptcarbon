/* ── KeptCarbon Textbook content ─────────────────────────────────────────
   Chapters → lessons. The sidebar, search, breadcrumb, and prev/next are
   all built from this list, so adding a lesson here is all a new page
   needs. Lessons are numbered by position: chapter 1, lesson 2 → "1.2".

   The chapter outline follows the Figma design; lesson bodies are still
   empty (the page shows "เนื้อหากำลังจัดทำ") until the content is written. */

export type LessonBlock =
  | { type: "paragraph"; text: string }
  /** Figure under /public, e.g. "/assets/img/kitty/textbook/carbon-cycle.png". */
  | { type: "image"; src: string; alt: string; caption?: string };

export type TextbookLesson = {
  /** URL segment: /kitty/textbook/<slug>. Must be unique across all chapters. */
  slug: string;
  title: string;
  /** Lead paragraph under the title. */
  intro?: string;
  body: LessonBlock[];
  /** เกร็ดความรู้ — side note shown beside the lesson. */
  tip?: string;
};

export type TextbookDownload = {
  label: string;
  /** File under /public, e.g. "/assets/docs/textbook/chapter-1.pdf". */
  href: string;
  /** Shown as "PDF · 2.4 MB". */
  format: string;
  size: string;
};

export type TextbookChapter = {
  title: string;
  lessons: TextbookLesson[];
  /** Chapter documents — shown beside every lesson of the chapter. */
  downloads?: TextbookDownload[];
};

export const textbookChapters: TextbookChapter[] = [
  {
    title: "ความรู้เบื้องต้นเกี่ยวกับคาร์บอน",
    lessons: [
      { slug: "what-is-carbon", title: "คาร์บอนคืออะไร", body: [] },
      { slug: "carbon-cycle", title: "วัฏจักรคาร์บอน", body: [] },
      { slug: "carbon-credit", title: "ความสำคัญของคาร์บอนเครดิต", body: [] },
    ],
  },
  {
    title: "การประเมินคาร์บอน",
    lessons: [
      { slug: "carbon-assessment", title: "หลักการประเมินคาร์บอนกักเก็บ", body: [] },
    ],
  },
  {
    title: "แนวทางการจัดการสวนยาง",
    lessons: [
      { slug: "rubber-plantation-management", title: "การจัดการสวนยางเพื่อกักเก็บคาร์บอน", body: [] },
    ],
  },
];

/* ── Lookups ─────────────────────────────────────────────────────────── */
export type LessonLink = { slug: string; title: string; number: string };

const flat = textbookChapters.flatMap((chapter, c) =>
  chapter.lessons.map((lesson, l) => ({ chapter, chapterNumber: c + 1, lesson, number: `${c + 1}.${l + 1}` }))
);

export const firstLessonSlug = flat[0].lesson.slug;

export function allLessonSlugs() {
  return flat.map(({ lesson }) => lesson.slug);
}

/** The lesson, its chapter, its "1.2" number, and its neighbours in
    reading order (across chapter boundaries). */
export function findLesson(slug: string) {
  const i = flat.findIndex(({ lesson }) => lesson.slug === slug);
  if (i === -1) return null;
  const toLink = (j: number): LessonLink | null =>
    flat[j] ? { slug: flat[j].lesson.slug, title: flat[j].lesson.title, number: flat[j].number } : null;
  return { ...flat[i], prev: toLink(i - 1), next: toLink(i + 1) };
}
