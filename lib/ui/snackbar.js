let enqueueSnackbarRef = null;

export function bindSnackbar(enqueueSnackbar) {
  enqueueSnackbarRef = enqueueSnackbar;
}

export function showSnackbar(message, options = {}) {
  const text = String(message || "").trim();

  if (!text || typeof enqueueSnackbarRef !== "function") {
    return;
  }

  enqueueSnackbarRef(text, {
    variant: options.variant || "default",
    preventDuplicate: true,
    autoHideDuration: options.autoHideDuration || 4000,
    anchorOrigin: options.anchorOrigin || {
      vertical: "bottom",
      horizontal: "right",
    },
  });
}

export function showErrorSnackbar(message, options = {}) {
  showSnackbar(message, {
    ...options,
    variant: "error",
  });
}

export function showSuccessSnackbar(message, options = {}) {
  showSnackbar(message, {
    ...options,
    variant: "success",
  });
}
