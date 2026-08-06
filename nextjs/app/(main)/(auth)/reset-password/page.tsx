import { notFound } from "next/navigation";
import { isPasswordResetEnabled } from "@/lib/feature-flags";
import { ResetPasswordForm } from "./ResetPasswordForm";

/**
 * /reset-password?token=... — set a new password from an emailed link.
 * Server component: gates on the flag, reads the token from the URL
 * (searchParams is a Promise in this Next version) and hands it to the form.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!isPasswordResetEnabled()) notFound();

  const sp = await searchParams;
  const raw = sp.token;
  const token = typeof raw === "string" ? raw : "";

  return <ResetPasswordForm token={token} />;
}
