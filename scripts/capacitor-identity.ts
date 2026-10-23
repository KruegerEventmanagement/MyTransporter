/** Android and iOS have separate identities; never sync both with one appId. */
export function capacitorAppId(argv: readonly string[], platform?: string): string {
  if (platform && platform !== "android" && platform !== "ios") {
    throw new Error("MT_CAPACITOR_PLATFORM must be android or ios");
  }
  const requested = argv.includes("ios") ? "ios" : argv.includes("android") ? "android" : undefined;
  if (platform && requested && platform !== requested) {
    throw new Error("MT_CAPACITOR_PLATFORM conflicts with Capacitor command platform");
  }
  if (!requested && argv.some((arg) => ["sync", "copy", "update", "add"].includes(arg))) {
    throw new Error("Select one platform: cap sync android / cap sync ios (or bun run cap:sync)");
  }
  return (requested ?? platform ?? "android") === "ios" ? "de.mytransporter.app" : "de.mytransporterr.app";
}