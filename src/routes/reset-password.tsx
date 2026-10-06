import { createFileRoute } from "@tanstack/react-router";
import { privateHead } from "@/lib/seo";
import { ResetPasswordView } from "@/components/ResetPasswordView";

export const Route = createFileRoute("/reset-password")({
  head: () => privateHead("Passwort zurücksetzen, MyTransporter"),
  component: ResetPasswordView,
});
