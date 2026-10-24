"use client";

import { useParams } from "next/navigation";
import BookPageEditor from "../../../BookPageEditor";
import { useBookData } from "../../../useBookData";

/* แก้ไขบทความ / บทเรียน — loads the page and the outline into the editor. */
export default function EditBookPagePage() {
    const { book, slug } = useParams<{ book: string; slug: string }>();
    const { data, placeholder } = useBookData(book, slug);
    if (!data?.page) return placeholder;
    return <BookPageEditor key={data.page.slug} book={data.book} outline={data.outline} initial={data.page} />;
}
