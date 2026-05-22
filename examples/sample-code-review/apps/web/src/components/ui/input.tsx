import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
}

export function Input({ label, id, className = '', ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <label
      className="block text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-slate-500"
      htmlFor={inputId}
    >
      {label}
      <input
        id={inputId}
        className={`mt-2.5 w-full rounded-[1.15rem] border border-[color:var(--app-field-border)] bg-[color:var(--app-field)] px-4 py-3 text-[0.95rem] text-slate-900 shadow-[0_1px_0_rgba(255,255,255,0.9),0_10px_18px_-14px_rgba(23,32,51,0.34)] transition placeholder:text-slate-400 focus:border-[rgba(15,118,110,0.55)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[rgba(15,118,110,0.14)] ${className}`}
        {...rest}
      />
    </label>
  );
}
