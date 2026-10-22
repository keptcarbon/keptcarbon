import { redirect } from "next/navigation";
import { firstLessonSlug } from "./content";

/* No overview page — the textbook opens on its first lesson. */
export default function TextbookIndexPage() {
  redirect(`/kitty/textbook/${firstLessonSlug}/`);
}
