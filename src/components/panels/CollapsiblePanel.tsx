import { useContext, useState, type ReactNode } from 'react';
import { AccordionContext } from './AccordionContext';

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
  const accordion = useContext(AccordionContext);
  const [localOpen, setLocalOpen] = useState(defaultOpen);

  // When rendered inside an InspectorPanel accordion, only the panel whose
  // title matches the shared openId is open — expanding one auto-collapses
  // the rest. Outside that context, each panel manages its own state. In the
  // phone's rail navigation, a panel shows only within its picked group.
  const nav = accordion?.navTitles ?? null;
  const open = nav ? true : accordion ? accordion.openId === title : localOpen;

  const toggle = () => {
    if (accordion) {
      accordion.setOpenId((cur) => (cur === title ? null : title));
    } else {
      setLocalOpen((o) => !o);
    }
  };

  if (nav && !nav.includes(title)) return null;

  return (
    <section className="panel" data-panel-title={title}>
      <div className="panel-head">
        {nav ? (
          <h2 className="panel-title" style={{ margin: 0 }}>
            {title} {badge}
          </h2>
        ) : (
          <button className="panel-toggle" onClick={toggle} aria-expanded={open}>
            <span className={`chevron ${open ? 'is-open' : ''}`}>›</span>
            <h2 className="panel-title" style={{ margin: 0 }}>
              {title} {badge}
            </h2>
          </button>
        )}
        {open && headerExtra}
      </div>
      {open && children}
    </section>
  );
}
