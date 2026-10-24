"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RndIndexPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/rnd/data-management");
    }, [router]);

    return null;
}
