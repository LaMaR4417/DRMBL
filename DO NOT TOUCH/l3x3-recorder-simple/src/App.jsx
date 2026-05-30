import { useEffect } from 'react';
import { GameProvider, useGame, useGameDispatch } from './context/GameContext';
import { fetchSeason } from './data/api';
import HomeScreen from './screens/HomeScreen';
import TeamSelectScreen from './screens/TeamSelectScreen';
import GameScreen from './screens/GameScreen';
import ConfirmScreen from './screens/ConfirmScreen';
import SavedScreen from './screens/SavedScreen';

function Router() {
    const game = useGame();
    const dispatch = useGameDispatch();

    useEffect(() => {
        if (!game.season) {
            fetchSeason()
                .then((s) => dispatch({ type: 'SET_SEASON', season: s }))
                .catch((e) => console.error('season load failed', e));
        }
    }, []);

    switch (game.step) {
        case 0: return <HomeScreen />;
        case 1: return <TeamSelectScreen />;
        case 2: return <GameScreen />;
        case 3: return <ConfirmScreen />;
        case 4: return <SavedScreen />;
        default: return <HomeScreen />;
    }
}

export default function App() {
    return (
        <GameProvider>
            <Router />
        </GameProvider>
    );
}
