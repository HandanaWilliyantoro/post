import { useFormik } from "formik";
import * as Yup from "yup";

export default function useAccountForm({ campaignSlug, router, setAccountRows, setFormError, setFormSuccess }) {
  return useFormik({
    initialValues: { username: "", platform: "instagram", status: "active", avatar_url: "", id: "" },
    validationSchema: Yup.object({
      username: Yup.string().trim().required("Username is required"),
      platform: Yup.string().required("Platform is required"),
      status: Yup.string().required("Status is required"),
      avatar_url: Yup.string().url("Avatar URL must be a valid URL").nullable(),
      id: Yup.string(),
    }),
    onSubmit: async (values, helpers) => {
      setFormError("");
      setFormSuccess("");
      try {
        const response = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, campaignSlug }) });
        const payload = await response.json();
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to create account");
        setAccountRows((current) => [...current, payload.data].sort((left, right) => String(left?.username || "").localeCompare(String(right?.username || ""))));
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
