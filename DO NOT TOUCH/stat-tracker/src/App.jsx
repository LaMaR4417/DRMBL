import { GameProvider, useGame } from './context/GameContext';
import HomeScreen from './screens/HomeScreen';
import GameSettingsScreen from './screens/GameSettingsScreen';
import TeamSelectScreen from './screens/TeamSelectScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import AssignNumbersScreen from './screens/AssignNumbersScreen';
import PickStartersScreen from './screens/PickStartersScreen';
import TipOffScreen from './screens/TipOffScreen';
import GameScreen from './screens/GameScreen';

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
    case 4:
      return <AssignNumbersScreen />;
    case 5:
      return <PickStartersScreen />;
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
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}
