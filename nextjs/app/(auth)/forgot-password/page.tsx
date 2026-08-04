import { notFound } from "next/navigation";
import { isPasswordResetEnabled } from "@/lib/feature-flags";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

/**
 * /forgot-password — request a reset link.
 * Server component: gates on the feature flag before rendering anything.
 */
export default function ForgotPasswordPage() {
  if (!isPasswordResetEnabled()) notFound();
  return <ForgotPasswordForm />;
}
