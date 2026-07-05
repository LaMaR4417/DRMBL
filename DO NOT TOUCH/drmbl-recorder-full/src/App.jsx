import { useEffect, useRef } from 'react';
import { GameProvider, useGame, useGameDispatch } from './context/GameContext';
import { LanguageProvider } from './context/LanguageContext';
import LangToggle from './components/LangToggle';
import TipOffOverlay from './components/TipOffOverlay';
import HomeScreen from './screens/HomeScreen';
import LeagueSelectScreen from './screens/LeagueSelectScreen';
import SeasonSelectScreen from './screens/SeasonSelectScreen';
import GameSelectScreen from './screens/GameSelectScreen';
import GameSettingsScreen from './screens/GameSettingsScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import AllStarAttendanceScreen from './screens/AllStarAttendanceScreen';
import GameScreen from './screens/GameScreen';
import { startAllStarFlow } from './data/allStars';

// Flow: 0=Home → 1=League → 2=Season → 3=Game Select → 4=Settings → 5=Attendance
// → 6=GameScreen with TipOff floating overlay → 7=GameScreen (live tracking)
//
// All-Star flow (via /drmbl-recorder/all-star/ or ?allstar): 5=Squad assignment
// (shared pool, split screen) → 6 → 7. League/season/game-select are skipped.

// The dedicated All-Star link is a Vercel rewrite of /drmbl-recorder/all-star/
// onto this same bundle; ?allstar is kept as a fallback (and for local dev).
function isAllStarEntry() {
  if (window.location.pathname.includes('/all-star')) return true;
  return new URLSearchParams(window.location.search).has('allstar');
}

function AppContent() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    if (isAllStarEntry()) startAllStarFlow(dispatch);
  }, [dispatch]);

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
      return game.allStarMode ? <AllStarAttendanceScreen /> : <AttendanceScreen />;
    case 6:
      return (
        <>
          <GameScreen />
          <TipOffOverlay />
        </>
      );
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
