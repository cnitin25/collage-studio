import { createContext } from 'react';

export interface AccordionContextValue {
  openId: string | null;
  setOpenId: (updater: string | null | ((cur: string | null) => string | null)) => void;
  /**
   * Phone navigation mode: the titles of the section group picked in the
   * inspector's left rail. Only those panels render, always expanded and
   * without a collapse toggle. null on desktop (plain accordion).
   */
  navTitles?: readonly string[] | null;
}

export const AccordionContext = createContext<AccordionContextValue | null>(null);
