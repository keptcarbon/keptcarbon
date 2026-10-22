import { redirect } from "next/navigation";
import { firstArticleSlug } from "./content";

/* No overview page — the handbook opens on its first article. */
export default function HandbookIndexPage() {
  redirect(`/kitty/handbook/${firstArticleSlug}/`);
}
