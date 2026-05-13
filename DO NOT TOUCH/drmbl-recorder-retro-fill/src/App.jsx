import { GameProvider, useGame } from './context/GameContext';
import { LanguageProvider } from './context/LanguageContext';
import LangToggle from './components/LangToggle';
import GamePickerScreen from './screens/GamePickerScreen';
import GameScreen from './screens/GameScreen';

// Retro-fill flow: 0=GamePicker → 7=GameScreen (edit mode).
// Pre-game setup screens are skipped — we load an existing box score directly.

function AppContent() {
  const game = useGame();

  switch (game.setupStep) {
    case 7:
      return <GameScreen />;
    default:
      return <GamePickerScreen />;
  }
}

export default function App() {
  return (
    <LanguageProvider>
      <GameProvider>
        <LangToggle />
        <AppContent />
      </GameProvider>
    </LanguageProvider>
  );
}
