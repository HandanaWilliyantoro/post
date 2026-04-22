import { useFormik } from "formik";
import * as Yup from "yup";

export default function useAccountForm({ campaignSlug, idleAccounts = [], router, setAccountRows, setFormError, setFormSuccess }) {
  return useFormik({
    initialValues: { accountId: "", username: "", platform: "instagram", status: "active" },
    validationSchema: Yup.object({
      accountId: Yup.string().trim().required("Account is required"),
      platform: Yup.string().required("Platform is required"),
      status: Yup.string().required("Status is required"),
    }),
    onSubmit: async (values, helpers) => {
      setFormError("");
      setFormSuccess("");
      try {
        const selectedAccount = idleAccounts.find((account) => String(account.id) === values.accountId);
        const response = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: values.accountId, username: selectedAccount?.username, campaignSlug }) });
        const payload = await response.json();
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to create account");
        if (payload.data?.campaignSlug === campaignSlug) {
          setAccountRows((current) => [...current, payload.data].sort((left, right) => String(left?.username || "").localeCompare(String(right?.username || ""))));
        }
        setFormSuccess("Account created.");
        helpers.resetForm();
        router.replace(router.asPath, undefined, { scroll: false });
      } catch (error) {
        setFormError(error.message || "Failed to create account");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });
}
