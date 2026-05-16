import { AuthGuard } from "@/app/components";

export default function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
