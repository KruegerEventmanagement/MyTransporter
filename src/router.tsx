import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { IS_NATIVE_BUILD, PUBLIC_ORIGIN } from "./lib/native/platform";
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

  if (IS_NATIVE_BUILD && typeof window !== "undefined") {
    void import("./lib/native/bootstrap").then((m) =>
      m.startNative((path) => void router.navigate({ href: path })),
    );
  }

  return router;
};
