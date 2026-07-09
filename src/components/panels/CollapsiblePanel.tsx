import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode; // small suffix next to the title, e.g. a count
  headerExtra?: ReactNode; // right-aligned control shown only while open, e.g. a "Reset" link
}

export default function CollapsiblePanel({
  title,
  children,
  defaultOpen = true,
  badge,
  headerExtra,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="panel">
      <div className="panel-head">
        <button className="panel-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className={`chevron ${open ? 'is-open' : ''}`}>›</span>
          <h2 className="panel-title" style={{ margin: 0 }}>
            {title} {badge}
          </h2>
        </button>
        {open && headerExtra}
      </div>
      {open && children}
    </section>
  );
}
