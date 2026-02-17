import { useLanguage, useSetLanguage } from '../context/LanguageContext';

export default function LangToggle() {
  const { lang } = useLanguage();
  const setLang = useSetLanguage();

  return (
    <button
      className="btn-lang-toggle"
      onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
      aria-label={lang === 'en' ? 'Cambiar a Español' : 'Switch to English'}
    >
      {lang === 'en' ? 'ES' : 'EN'}
    </button>
  );
}
