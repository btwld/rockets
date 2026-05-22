import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { Button } from './ui/button';

interface AppShellProps {
  readonly title: string;
  readonly titleTestId?: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}

const navItemClass = ({ isActive }: { isActive: boolean }): string =>
  [
    'rounded-full px-4 py-2 text-sm font-semibold transition',
    isActive
      ? 'bg-slate-950 text-white shadow-lg shadow-slate-900/10'
      : 'text-slate-600 hover:bg-white/70 hover:text-slate-950',
  ].join(' ');

export function AppShell({
  title,
  titleTestId,
  subtitle,
  children,
}: AppShellProps) {
  const { signOut } = useAuth();

  return (
    <div className="app-shell-grid relative min-h-screen overflow-hidden">
      <div className="app-orb pointer-events-none absolute left-[-6rem] top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(198,125,50,0.24),_transparent_72%)] blur-2xl" />
      <div className="app-orb app-orb-delay pointer-events-none absolute right-[-4rem] top-40 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(15,118,110,0.18),_transparent_72%)] blur-2xl" />
      <header className="sticky top-0 z-20 border-b border-[color:var(--app-line)] bg-[rgba(251,247,240,0.78)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.32em] text-[#8c5d2f]">
              Rockets SDK
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              Sample Code Review
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 rounded-full border border-white/70 bg-white/65 p-1.5 shadow-[0_18px_50px_-34px_rgba(23,32,51,0.35)]">
            <NavLink to="/" end className={navItemClass}>
              Dashboard
            </NavLink>
            <NavLink
              to="/profile"
              data-testid="nav-profile"
              className={navItemClass}
            >
              Profile
            </NavLink>
            <Button variant="ghost" type="button" onClick={() => void signOut()}>
              Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
        <section>
          <h1
            className="text-3xl font-extrabold tracking-[-0.04em] text-slate-950 sm:text-4xl"
            data-testid={titleTestId}
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
              {subtitle}
            </p>
          ) : null}
        </section>
        {children}
      </main>
    </div>
  );
}
