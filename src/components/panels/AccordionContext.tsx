import { createContext } from 'react';

export interface AccordionContextValue {
  openId: string | null;
  setOpenId: (updater: string | null | ((cur: string | null) => string | null)) => void;
}

export const AccordionContext = createContext<AccordionContextValue | null>(null);
