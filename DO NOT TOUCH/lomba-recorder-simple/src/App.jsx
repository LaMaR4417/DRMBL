import { GameProvider, useGame } from './context/GameContext';
import SeasonSelectScreen from './screens/SeasonSelectScreen';
import CategoryScreen from './screens/CategoryScreen';
import DivisionScreen from './screens/DivisionScreen';
import ModeSelectScreen from './screens/ModeSelectScreen';
import GameSelectScreen from './screens/GameSelectScreen';
import SeriesGamesScreen from './screens/SeriesGamesScreen';
import RecordScreen from './screens/RecordScreen';

function Router() {
    var game = useGame();
    if (game.step === 4.5) return <SeriesGamesScreen />;
    switch (game.step) {
        case 0: return <SeasonSelectScreen />;
        case 1: return <CategoryScreen />;
        case 2: return <DivisionScreen />;
        case 3: return <ModeSelectScreen />;
        case 4: return <GameSelectScreen />;
        case 5: return <RecordScreen />;
        default: return <SeasonSelectScreen />;
    }
}

export default function App() {
    return (
        <GameProvider>
            <Router />
        </GameProvider>
    );
}
