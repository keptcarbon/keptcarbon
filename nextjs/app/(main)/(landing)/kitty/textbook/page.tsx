import { redirect } from "next/navigation";
import { getPublishedOutline } from "@/lib/kitty-book";
import { BookBody } from "../BookParts";

export const dynamic = "force-dynamic";

/* No overview page — the textbook opens on its first published lesson. */
export default async function TextbookIndexPage() {
  const first = (await getPublishedOutline("textbook"))[0]?.pages[0];
  if (first) redirect(`/kitty/textbook/${first.slug}/`);
  return <BookBody body={[]} />;
}
