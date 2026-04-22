function getButtonClassName({ variant, disabled, className }) {
  const base =
    "w-full rounded-[18px] px-[1.15rem] py-[0.95rem] text-[0.95rem] font-bold tracking-[0.02em] transition duration-200 focus:outline-none";
  const tone =
    variant === "ghost"
      ? "border border-[rgba(24,32,38,0.12)] bg-transparent text-[var(--color-ink)] shadow-none"
      : "border-0 bg-[linear-gradient(135deg,#249a5a,#38c172)] text-white shadow-[0_14px_28px_rgba(36,154,90,0.24)]";
  const state = disabled
    ? "cursor-not-allowed opacity-60 shadow-none"
    : "cursor-pointer hover:-translate-y-[2px] hover:saturate-[1.06]";

  return [base, tone, state, className].filter(Boolean).join(" ");
}

export default function PrimaryButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  className = "",
  disabled = false,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={getButtonClassName({ variant, disabled, className })}
    >
      {children}
    </button>
  );
}
