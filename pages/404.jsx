import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="dashboard-main-panel w-full max-w-lg rounded-[28px] p-8 text-center">
        <p className="dashboard-section-label">404</p>
        <h1 className="campaign-top-title">Page not found</h1>
        <p className="campaign-top-description">
          The requested campaign or view is not available.
        </p>
        <Link
          href="/"
          className="dashboard-button-inline mt-6 inline-flex items-center justify-center"
        >
          Open dashboard
        </Link>
      </section>
    </main>
  );
}
