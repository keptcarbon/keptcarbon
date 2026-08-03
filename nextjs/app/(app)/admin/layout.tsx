"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

const TABS = [
    { href: "/admin/users", label: "ข้อมูลผู้ใช้", icon: "bi-people" },
    { href: "/admin/auth-logs", label: "บันทึกการเข้าสู่ระบบ", icon: "bi-clock-history" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { ready, user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (ready && (!user || user.role !== "admin")) {
            router.replace("/");
        }
    }, [ready, user, router]);

    if (!ready || !user || user.role !== "admin") {
        return (
            <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
                <div className="spinner-border text-success" role="status" />
            </div>
        );
    }

    return (
        <div className="container py-5" style={{ marginTop: "60px" }}>
            <div className="mb-4" style={{ display: "flex", gap: 4, borderBottom: "1px solid #e6f0ea" }}>
                {TABS.map((tab) => {
                    const active = pathname.startsWith(tab.href);
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "10px 16px",
                                fontSize: 14,
                                fontWeight: 600,
                                color: active ? "#1e7a47" : "#5a7a65",
                                borderBottom: active ? "2px solid #1e7a47" : "2px solid transparent",
                                textDecoration: "none",
                                marginBottom: -1,
                            }}
                        >
                            <i className={`bi ${tab.icon}`} />
                            {tab.label}
                        </Link>
                    );
                })}
            </div>
            {children}
        </div>
    );
}
