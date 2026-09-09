import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, children, action }: PageHeaderProps) {
  return (
    <section className="research-page-header">
      <div className="research-page-copy">
        <p className="origin-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action && <div className="research-page-action">{action}</div>}
    </section>
  );
}
