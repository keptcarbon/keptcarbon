import type { Metadata } from "next";
import BlogBrowser from "./BlogBrowser";

export const metadata: Metadata = {
  title: "Keppy Blog | KeptCarbon",
  description: "อัปเดตข่าวสาร บทความ และเรื่องราวจาก KeptCarbon",
};

export default function BlogPage() {
  return (
    <div className="kc-tw bg-muted/60 pt-16">
      <BlogBrowser />
    </div>
  );
}
