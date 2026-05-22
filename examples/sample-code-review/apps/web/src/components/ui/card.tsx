import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-[1.75rem] border border-[rgba(23,32,51,0.08)] bg-[color:var(--app-card)] p-6 shadow-[0_28px_70px_-42px_rgba(23,32,51,0.38)] backdrop-blur-xl sm:p-7 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
