import { Footer, ScrollTop } from "@/app/components";
import AOSInit from "@/app/components/utilities/AOSInit";
import SmoothScroll from "@/app/components/utilities/SmoothScroll";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="index-page">
      <main className="main">{children}</main>
      <Footer />
      <ScrollTop />
      <AOSInit />
      <SmoothScroll />
    </div>
  );
}
