/* ==========================================================================
   KeptCarbon Component Library — Atomic Design
   Import from here: import { Button, Header, AuthGuard } from "@/app/components"
   ========================================================================== */

/* ── Atoms ────────────── smallest, indivisible UI elements ── */
export { Button, Input, Alert, Card, Eyebrow, GradientText } from "./atoms";
export type {
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  InputProps,
  AlertProps,
  AlertType,
  CardProps,
  EyebrowProps,
  GradientTextProps,
} from "./atoms";

/* ── Molecules ────────── composed from atoms ── */
export { FormGroup, ModalShell, ScrollTop } from "./molecules";
export type { FormGroupProps, ModalShellProps } from "./molecules";

/* ── Organisms ────────── complex, self-contained sections ── */
export { Header, Footer, AuthModals } from "./organisms";

/* ── Templates ────────── page-level wrappers and guards ── */
export { AuthGuard } from "./templates";
