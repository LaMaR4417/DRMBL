import { GameProvider, useGame } from './context/GameContext';
import { LanguageProvider } from './context/LanguageContext';
import LangToggle from './components/LangToggle';
import HomeScreen from './screens/HomeScreen';
import LeagueSelectScreen from './screens/LeagueSelectScreen';
import SeasonSelectScreen from './screens/SeasonSelectScreen';
import GameSelectScreen from './screens/GameSelectScreen';
import GameSettingsScreen from './screens/GameSettingsScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import TipOffScreen from './screens/TipOffScreen';
import GameScreen from './screens/GameScreen';

// Flow: 0=Home → 1=League → 2=Season → 3=Game Select → 4=Settings → 5=Attendance → 6=Tip-Off → 7=Game

function AppContent() {
  const game = useGame();

  switch (game.setupStep) {
    case 0:
      return <HomeScreen />;
    case 1:
      return <LeagueSelectScreen />;
    case 2:
      return <SeasonSelectScreen />;
    case 3:
      return <GameSelectScreen />;
    case 4:
      return <GameSettingsScreen />;
    case 5:
      return <AttendanceScreen />;
    case 6:
      return <TipOffScreen />;
    case 7:
      return <GameScreen />;
    default:
      return <HomeScreen />;
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
