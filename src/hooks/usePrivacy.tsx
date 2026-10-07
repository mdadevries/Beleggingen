import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'beleggingen_privacy';
export const MASK = '••••';

interface PrivacyValue {
  /** Anonieme modus aan: aantallen en bedragen zijn verborgen. */
  hidden: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyValue>({ hidden: false, toggle: () => undefined });

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Anonieme modus, handig als je de site laat zien. Verbergt hoeveel stuks je
 * hebt en alle bedragen die daaruit volgen (waarde, ingelegd, resultaat in
 * euro's). Koersen en percentages blijven zichtbaar. Blijft staan na verversen.
 */
export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hidden, setHidden] = useState<boolean>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0');
    } catch {
      /* negeren */
    }
  }, [hidden]);

  const toggle = useCallback(() => setHidden((h) => !h), []);
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
};

export const usePrivacy = () => useContext(PrivacyContext);

/** Toont children, of "••••" als de anonieme modus aan staat. */
export const Private: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hidden } = usePrivacy();
  if (!hidden) return <>{children}</>;
  return (
    <span aria-label="verborgen" className="select-none tracking-wider">
      {MASK}
    </span>
  );
};
