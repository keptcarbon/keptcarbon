import { AuthGuard } from "@/app/components";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <main className="db-layout">
        {children}
      </main>
    </AuthGuard>
  );
}
