import { redirect } from "next/navigation";
import { getPublishedOutline } from "@/lib/kitty-book";
import { BookBody } from "../BookParts";

export const dynamic = "force-dynamic";

/* No overview page — the handbook opens on its first published article. */
export default async function HandbookIndexPage() {
  const first = (await getPublishedOutline("handbook"))[0]?.pages[0];
  if (first) redirect(`/kitty/handbook/${first.slug}/`);
  return <BookBody body={[]} />;
}
