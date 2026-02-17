import { useLanguage } from '../context/LanguageContext';

export function useTranslation() {
  const { dict, lang } = useLanguage();

  function t(namespace, key, vars = {}) {
    const section = dict[namespace];
    if (!section) return key;
    let str = section[key];
    if (str === undefined) return key;
    return str.replace(/\{(\w+)\}/g, (_, token) => {
      const val = vars[token];
      return val !== undefined ? String(val) : `{${token}}`;
    });
  }

  return { t, lang };
}
