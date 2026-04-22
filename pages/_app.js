import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { SnackbarProvider, useSnackbar } from "notistack";

import "@/styles/globals.css";
import { bindSnackbar, showErrorSnackbar } from "@/lib/ui/snackbar";

function SnackbarBinder() {
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    bindSnackbar(enqueueSnackbar);
  }, [enqueueSnackbar]);

  return null;
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  useEffect(() => {
    const handleStart = () => {
      setIsRouteLoading(true);
    };

    const handleComplete = () => {
      setIsRouteLoading(false);
    };

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleComplete);
    router.events.on("routeChangeError", handleComplete);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleComplete);
      router.events.off("routeChangeError", handleComplete);
    };
  }, [router.events]);

  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      const reason = event?.reason;
      const message =
        reason?.message ||
        (typeof reason === "string" ? reason : "") ||
        "An unexpected error occurred";

      showErrorSnackbar(message);
    };

    const handleWindowError = (event) => {
      const message =
        event?.error?.message ||
        event?.message ||
        "An unexpected error occurred";

      showErrorSnackbar(message);
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleWindowError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleWindowError);
    };
  }, []);

  return (
    <SnackbarProvider maxSnack={4}>
      <SnackbarBinder />
      <div>
        {isRouteLoading ? (
          <div className="app-route-loader" aria-live="polite" aria-busy="true">
            <div className="app-route-loader-panel">
              <span className="app-route-loader-spinner" />
              <p className="app-route-loader-title">Loading details</p>
              <p className="app-route-loader-copy">
                Preparing the selected campaign view.
              </p>
            </div>
          </div>
        ) : null}
        <Component {...pageProps} />
      </div>
    </SnackbarProvider>
  );
}
