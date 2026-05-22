import type { ReactNode } from 'react';

type AlertVariant = 'error' | 'success' | 'info';

const variantClasses: Record<AlertVariant, string> = {
  error:
    'border-[rgba(190,24,93,0.16)] bg-[rgba(255,241,242,0.92)] text-rose-900',
  success:
    'border-[rgba(5,150,105,0.16)] bg-[rgba(236,253,245,0.92)] text-emerald-950',
  info:
    'border-[rgba(15,118,110,0.16)] bg-[rgba(240,253,250,0.92)] text-teal-950',
};

interface AlertProps {
  readonly variant?: AlertVariant;
  readonly children: ReactNode;
  readonly testId?: string;
}

export function Alert({
  variant = 'info',
  children,
  testId,
}: AlertProps) {
  return (
    <div
      className={`rounded-[1.25rem] border px-4 py-3 text-sm shadow-[0_14px_35px_-28px_rgba(23,32,51,0.3)] ${variantClasses[variant]}`}
      data-testid={testId}
      role="alert"
    >
      {children}
    </div>
  );
}
