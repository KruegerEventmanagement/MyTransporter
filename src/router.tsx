import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { IS_NATIVE_BUILD, PUBLIC_ORIGIN, isNativeApp } from "./lib/native/platform";
import { installRemoteFetch } from "./lib/native/remote-fetch";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Nur im Native-Build (MT_NATIVE=1): Server-Funktionen an den Worker leiten.
  if (IS_NATIVE_BUILD && typeof window !== "undefined") installRemoteFetch(PUBLIC_ORIGIN);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Native Integrationen (Zurück-Taste, Deep Links, Push-Tipps) zur Laufzeit erkennen,
  // auch wenn die App die Live-Website lädt.
  if (typeof window !== "undefined" && (IS_NATIVE_BUILD || isNativeApp())) {
    void import("./lib/native/bootstrap").then((m) =>
      m.startNative((path) => void router.navigate({ href: path })),
    );
  }

  return router;
};
