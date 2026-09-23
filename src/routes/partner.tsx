import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/partner")({
  beforeLoad: () => {
    throw redirect({ to: "/werbung", statusCode: 301 });
  },
});