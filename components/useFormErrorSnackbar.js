import { useEffect, useRef } from "react";

import { showErrorSnackbar } from "@/lib/ui/snackbar";

function firstErrorMessage(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstErrorMessage(item);
      if (message) {
        return message;
      }
    }

    return "";
  }

  if (typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      const message = firstErrorMessage(nestedValue);
      if (message) {
        return message;
      }
    }
  }

  return "";
}

export default function useFormErrorSnackbar(formik, options = {}) {
  const lastKeyRef = useRef("");

  useEffect(() => {
    const submitCount = Number(formik?.submitCount || 0);

    if (submitCount <= 0) {
      return;
    }

    const message = firstErrorMessage(formik?.errors);

    if (!message) {
      return;
    }

    const nextKey = `${submitCount}:${message}`;

    if (lastKeyRef.current === nextKey) {
      return;
    }

    lastKeyRef.current = nextKey;
    showErrorSnackbar(message, {
      autoHideDuration: options.autoHideDuration || 6000,
    });
  }, [formik?.errors, formik?.submitCount, options.autoHideDuration]);
}
