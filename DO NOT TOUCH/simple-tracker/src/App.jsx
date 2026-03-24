import { GameProvider, useGame } from './context/GameContext';
import HomeScreen from './screens/HomeScreen';
import LeagueSelectScreen from './screens/LeagueSelectScreen';
import SeasonSelectScreen from './screens/SeasonSelectScreen';
import GameSelectScreen from './screens/GameSelectScreen';
import SimpleGameScreen from './screens/SimpleGameScreen';

function AppContent() {
  const game = useGame();
  switch (game.step) {
    case 0: return <HomeScreen />;
    case 1: return <LeagueSelectScreen />;
    case 2: return <SeasonSelectScreen />;
    case 3: return <GameSelectScreen />;
    case 4: return <SimpleGameScreen />;
    default: return <HomeScreen />;
  }
}

export default function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}
