import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, children, action }: PageHeaderProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <p className="inline-flex rounded-[var(--radius-pill)] bg-white/48 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-secondary)] ring-1 ring-white/65">
          {eyebrow}
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[0.95] tracking-[-0.045em] text-[var(--color-ink)] sm:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--color-ink-secondary)]">
          {children}
        </p>
      </div>
      {action && <div className="lg:justify-self-end">{action}</div>}
    </div>
  );
}
