import { useGameDispatch } from '../context/GameContext';
import { useTranslation } from '../i18n/useTranslation';

export default function HomeScreen() {
  const dispatch = useGameDispatch();
  const { t } = useTranslation();

  return (
    <div className="screen home-screen">
      <div className="home-content">
        <h1 className="home-title">{t('home', 'title')}</h1>
        <p className="home-subtitle">{t('home', 'subtitle')}</p>
        <div className="home-actions">
          <button
            className="btn btn-primary btn-large"
            onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}
          >
            {t('home', 'newGame')}
          </button>
        </div>
      </div>
    </div>
  );
}
