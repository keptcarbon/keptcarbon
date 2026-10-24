"use client";

import { useParams } from "next/navigation";
import OutlineEditor from "../../OutlineEditor";
import { useBookData } from "../../useBookData";

/* จัดการสารบัญ — sections and page order of one book. */
export default function BookOutlinePage() {
    const { book } = useParams<{ book: string }>();
    const { data, placeholder } = useBookData(book);
    if (!data) return placeholder;
    return <OutlineEditor book={data.book} initial={data.outline} />;
}
