"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const ALLOWED_ROLES = ["admin", "rd"];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { ready, user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (ready && (!user || !ALLOWED_ROLES.includes(user.role))) {
            router.replace("/");
        }
    }, [ready, user, router]);

    if (!ready || !user || !ALLOWED_ROLES.includes(user.role)) {
        return (
            <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
                <div className="spinner-border text-success" role="status" />
            </div>
        );
    }

    return (
        <div className="container py-5" style={{ marginTop: "60px" }}>
            {children}
        </div>
    );
}
