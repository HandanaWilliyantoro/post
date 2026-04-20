import { useEffect } from "react";

import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";

export default function useFeedbackEffects(formError, formSuccess) {
  useEffect(() => {
    if (formError) showErrorSnackbar(formError, { autoHideDuration: 6000 });
  }, [formError]);

  useEffect(() => {
    if (formSuccess) showSuccessSnackbar(formSuccess);
  }, [formSuccess]);
}
