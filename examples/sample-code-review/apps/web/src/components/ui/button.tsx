import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[linear-gradient(135deg,#172033,#28415e)] text-white shadow-[0_18px_38px_-20px_rgba(23,32,51,0.75)] hover:-translate-y-0.5 hover:shadow-[0_24px_46px_-18px_rgba(23,32,51,0.65)] focus-visible:ring-[#28415e]',
  secondary:
    'border border-white/70 bg-[rgba(255,255,255,0.82)] text-slate-900 shadow-[0_14px_35px_-24px_rgba(23,32,51,0.38)] hover:-translate-y-0.5 hover:bg-white focus-visible:ring-[#8c5d2f]',
  ghost:
    'bg-transparent text-slate-700 hover:bg-white/60 hover:text-slate-950 focus-visible:ring-[#8c5d2f]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold tracking-[-0.01em] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf7f0] disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
