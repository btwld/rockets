interface SpinnerProps {
  readonly label?: string;
  readonly className?: string;
}

export function Spinner({ label = 'Loading…', className = '' }: SpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 text-slate-600 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className="relative h-10 w-10 animate-spin rounded-full border-2 border-[rgba(23,32,51,0.12)] border-t-[color:var(--app-accent)]"
        aria-hidden
      >
        <span className="absolute inset-[5px] rounded-full border border-[rgba(198,125,50,0.28)]" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
