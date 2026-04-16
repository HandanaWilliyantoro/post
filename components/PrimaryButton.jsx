import tw, { styled } from "twin.macro";

const BaseButton = styled.button(({ $variant, disabled }) => [
  tw`w-full rounded-[18px] px-[1.15rem] py-[0.95rem] text-[0.95rem] font-bold tracking-[0.02em] text-white transition duration-200`,
  tw`[box-shadow:0_14px_28px_rgba(36,154,90,0.24)]`,
  tw`focus:outline-none`,
  $variant === "ghost"
    ? tw`border border-[rgba(24,32,38,0.12)] bg-transparent text-[var(--color-ink)] shadow-none`
    : tw`border-0 bg-[linear-gradient(135deg,#249a5a,#38c172)]`,
  !disabled && tw`cursor-pointer hover:-translate-y-[2px] hover:saturate-[1.06]`,
  disabled && tw`cursor-not-allowed opacity-60 shadow-none`,
]);

export default function PrimaryButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  className = "",
  disabled = false,
}) {
  return (
    <BaseButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      $variant={variant}
      className={className}
    >
      {children}
    </BaseButton>
  );
}
