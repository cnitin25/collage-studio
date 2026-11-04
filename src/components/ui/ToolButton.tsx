import type { ButtonHTMLAttributes } from 'react';
import Icon, { type IconName } from './Icon';

type ToolButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  /** Accessible name; also the tooltip unless `tip` says more. */
  label: string;
  tip?: string;
  /** Anchor the tooltip to the button's right / left edge, for buttons near
   *  the window's right / left edge. */
  tipEnd?: boolean;
  tipStart?: boolean;
};

/**
 * Icon-only button. The name lives in aria-label; sighted mouse users get it
 * from the CSS tooltip (`data-tip`, see index.css), which replaces the slower
 * native `title` tooltip — so no `title` here, or both would show.
 */
export default function ToolButton({ icon, label, tip, tipEnd, tipStart, className = '', ...rest }: ToolButtonProps) {
  return (
    <button
      className={`btn icon-btn ${className}`}
      aria-label={label}
      data-tip={tip ?? label}
      data-tip-align={tipEnd ? 'end' : tipStart ? 'start' : undefined}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
