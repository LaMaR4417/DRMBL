import { GameProvider, useGame } from './context/GameContext';
import HomeScreen from './screens/HomeScreen';
import GameSettingsScreen from './screens/GameSettingsScreen';
import TeamSelectScreen from './screens/TeamSelectScreen';
import AttendanceScreen from './screens/AttendanceScreen';

function AppContent() {
  const game = useGame();

  switch (game.setupStep) {
    case 0:
      return <HomeScreen />;
    case 1:
      return <GameSettingsScreen />;
    case 2:
      return <TeamSelectScreen />;
    case 3:
      return <AttendanceScreen />;
    default:
      return <HomeScreen />;
  }
}

export default function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}
