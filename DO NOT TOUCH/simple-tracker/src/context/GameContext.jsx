import { createContext, useContext, useReducer } from 'react';

const GameContext = createContext(null);
const GameDispatchContext = createContext(null);

const initialState = {
  // 0=home, 1=league, 2=season, 3=game-select, 4=game
  step: 0,

  selectedLeague: null,
  selectedSeason: null,
  selectedGame: null,

  // { teamID, name, slot }
  homeTeam: null,
  awayTeam: null,

  // Simple scoreboard
  homeScore: 0,
  awayScore: 0,
  currentQuarter: 1,

  // Game status
  gameId: null,
  status: null, // null | 'in-progress' | 'final'
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };

    case 'SET_LEAGUE':
      return { ...state, selectedLeague: action.league, selectedSeason: null, selectedGame: null, homeTeam: null, awayTeam: null };

    case 'SET_SEASON':
      return { ...state, selectedSeason: action.season, selectedGame: null, homeTeam: null, awayTeam: null };

    case 'SET_GAME': {
      const teams = state.selectedSeason?.teams || [];
      const home = teams.find((t) => t.slot === action.game.home);
      const away = teams.find((t) => t.slot === action.game.away);
      return {
        ...state,
        selectedGame: action.game,
        homeTeam: home ? { teamID: home.teamID, name: home.name, slot: home.slot } : null,
        awayTeam: away ? { teamID: away.teamID, name: away.name, slot: away.slot } : null,
      };
    }

    case 'CLEAR_GAME':
      return { ...state, selectedGame: null, homeTeam: null, awayTeam: null };

    case 'SET_HOME_TEAM':
      return { ...state, homeTeam: { teamID: action.teamID, name: action.name, slot: action.slot } };

    case 'SET_AWAY_TEAM':
      return { ...state, awayTeam: { teamID: action.teamID, name: action.name, slot: action.slot } };

    case 'CLEAR_HOME_TEAM':
      return { ...state, homeTeam: null };

    case 'CLEAR_AWAY_TEAM':
      return { ...state, awayTeam: null };

    case 'START_GAME': {
      const homeName = state.homeTeam?.name || 'Home';
      const awayName = state.awayTeam?.name || 'Away';
      const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return {
        ...state,
        step: 4,
        homeScore: 0,
        awayScore: 0,
        currentQuarter: 1,
        status: 'in-progress',
        gameId: `${slug(homeName)}-vs-${slug(awayName)}`,
      };
    }

    case 'ADD_POINTS': {
      const key = action.side === 'home' ? 'homeScore' : 'awayScore';
      return { ...state, [key]: Math.max(0, state[key] + action.points) };
    }

    case 'ADVANCE_QUARTER':
      return { ...state, currentQuarter: state.currentQuarter + 1 };

    case 'REVERT_QUARTER':
      return { ...state, currentQuarter: Math.max(1, state.currentQuarter - 1) };

    case 'END_GAME':
      return { ...state, status: 'final' };

    case 'UNDO_END_GAME':
      return { ...state, status: 'in-progress' };

    case 'RESTORE_GAME':
      return {
        ...state,
        step: 4,
        selectedLeague: action.selectedLeague || null,
        selectedSeason: action.selectedSeason || null,
        selectedGame: action.selectedGame || null,
        homeTeam: action.homeTeam || null,
        awayTeam: action.awayTeam || null,
        homeScore: action.homeScore || 0,
        awayScore: action.awayScore || 0,
        currentQuarter: action.currentQuarter || 1,
        gameId: action.gameId || null,
        status: 'in-progress',
      };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <GameContext.Provider value={state}>
      <GameDispatchContext.Provider value={dispatch}>
        {children}
      </GameDispatchContext.Provider>
    </GameContext.Provider>
  );
}

export function useGame() { return useContext(GameContext); }
export function useGameDispatch() { return useContext(GameDispatchContext); }
