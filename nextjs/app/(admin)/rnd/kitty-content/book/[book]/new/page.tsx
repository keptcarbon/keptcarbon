"use client";

import { useParams } from "next/navigation";
import BookPageEditor from "../../BookPageEditor";
import { NoSections, useBookData } from "../../useBookData";

/* สร้างบทความ (handbook) / สร้างบทเรียน (textbook). */
export default function NewBookPagePage() {
    const { book } = useParams<{ book: string }>();
    const { data, placeholder } = useBookData(book);
    if (!data) return placeholder;
    if (data.outline.length === 0) return <NoSections book={data.book} />;
    return <BookPageEditor book={data.book} outline={data.outline} />;
}
