import { redirect } from "next/navigation";

/* /dashboard has no page of its own; land on the first dashboard. */
export default function DashboardIndex() {
  redirect("/dashboard/carbon-stock");
}
