import { createContext, useContext, useState, useCallback } from 'react';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const DICTIONARIES = { en, es };
const STORAGE_KEY = 'drmbl_lang';

const LanguageContext = createContext(null);
const LanguageSetContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'es' ? 'es' : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = useCallback((nextLang) => {
    try { localStorage.setItem(STORAGE_KEY, nextLang); } catch {}
    setLangState(nextLang);
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, dict: DICTIONARIES[lang] }}>
      <LanguageSetContext.Provider value={setLang}>
        {children}
      </LanguageSetContext.Provider>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useSetLanguage() {
  return useContext(LanguageSetContext);
}
