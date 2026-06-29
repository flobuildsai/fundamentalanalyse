import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, children, action }: PageHeaderProps) {
  return (
    <section className="origin-page-hero">
      <div className="origin-page-hero-copy">
        <p className="origin-eyebrow">{eyebrow}</p>
        <h1>
          <em>{title.split(" ")[0]}</em>{" "}
          {title.split(" ").slice(1).join(" ")}
        </h1>
        <p>{children}</p>
        {action && <div className="origin-page-hero-action">{action}</div>}
      </div>
      <div className="origin-floating-card" aria-hidden="true">
        <div className="origin-floating-card-top">
          <span>{eyebrow}</span>
          <span>›</span>
        </div>
        <div className="origin-floating-row">
          <span>Signal</span>
          <strong>82</strong>
        </div>
        <div className="origin-progress"><span style={{ width: "68%" }} /></div>
        <div className="origin-floating-row muted">
          <span>Risk Gate</span>
          <strong>Normal</strong>
        </div>
        <div className="origin-progress thin"><span style={{ width: "34%" }} /></div>
      </div>
    </section>
  );
}
