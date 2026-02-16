import { createContext, useContext, useReducer } from 'react';
import { DRMBL_DEFAULT } from '../data/gameSettings';

const GameContext = createContext(null);
const GameDispatchContext = createContext(null);

const initialState = {
  // Pre-game setup step tracking
  setupStep: 0, // 0=home, 1=settings, 2=teams, 3=attendance, 4=numbers, 5=starters, 6=tipoff

  // Game settings (loaded from preset, overridable)
  settings: structuredClone(DRMBL_DEFAULT),

  // Team selections — set during team pick, roster loaded async from API
  // { teamID, name, slot, roster: [...] | null }
  homeTeam: null,
  awayTeam: null,

  // Attendance: which players showed up (playerID sets)
  homeAttendance: new Set(),
  awayAttendance: new Set(),

  // Number overrides for this game: { playerID: newNumber }
  homeNumberOverrides: {},
  awayNumberOverrides: {},

  // Starters: sets of 5 playerIDs per team
  homeStarters: new Set(),
  awayStarters: new Set(),

  // Tip-off winner: 'home' | 'away' | null
  tipOffWinner: null,
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, setupStep: action.step };

    case 'SET_SETTINGS':
      return { ...state, settings: action.settings };

    case 'UPDATE_SETTING': {
      const newSettings = structuredClone(state.settings);
      setNestedValue(newSettings, action.path, action.value);
      return { ...state, settings: newSettings };
    }

    case 'SET_HOME_TEAM':
      return {
        ...state,
        homeTeam: { teamID: action.teamID, name: action.name, slot: action.slot, roster: null },
        homeAttendance: new Set(),
        homeNumberOverrides: {},
        homeStarters: new Set(),
      };

    case 'SET_AWAY_TEAM':
      return {
        ...state,
        awayTeam: { teamID: action.teamID, name: action.name, slot: action.slot, roster: null },
        awayAttendance: new Set(),
        awayNumberOverrides: {},
        awayStarters: new Set(),
      };

    case 'SET_TEAM_ROSTER': {
      const teamKey = action.side === 'home' ? 'homeTeam' : 'awayTeam';
      const team = state[teamKey];
      if (!team) return state;
      return { ...state, [teamKey]: { ...team, roster: action.roster } };
    }

    case 'TOGGLE_ATTENDANCE': {
      const key = action.side === 'home' ? 'homeAttendance' : 'awayAttendance';
      const next = new Set(state[key]);
      if (next.has(action.playerID)) {
        next.delete(action.playerID);
      } else {
        next.add(action.playerID);
      }
      return { ...state, [key]: next };
    }

    case 'SELECT_ALL_ATTENDANCE': {
      const teamKey = action.side === 'home' ? 'homeTeam' : 'awayTeam';
      const attKey = action.side === 'home' ? 'homeAttendance' : 'awayAttendance';
      const team = state[teamKey];
      if (!team || !team.roster) return state;
      const all = new Set(team.roster.map((p) => p.playerID));
      return { ...state, [attKey]: all };
    }

    case 'CLEAR_ATTENDANCE': {
      const attKey = action.side === 'home' ? 'homeAttendance' : 'awayAttendance';
      return { ...state, [attKey]: new Set() };
    }

    case 'SET_NUMBER_OVERRIDE': {
      const key = action.side === 'home' ? 'homeNumberOverrides' : 'awayNumberOverrides';
      return {
        ...state,
        [key]: { ...state[key], [action.playerID]: action.number },
      };
    }

    case 'CLEAR_NUMBER_OVERRIDE': {
      const key = action.side === 'home' ? 'homeNumberOverrides' : 'awayNumberOverrides';
      const next = { ...state[key] };
      delete next[action.playerID];
      return { ...state, [key]: next };
    }

    case 'TOGGLE_STARTER': {
      const key = action.side === 'home' ? 'homeStarters' : 'awayStarters';
      const next = new Set(state[key]);
      if (next.has(action.playerID)) {
        next.delete(action.playerID);
      } else if (next.size < 5) {
        next.add(action.playerID);
      }
      return { ...state, [key]: next };
    }

    case 'SET_TIP_OFF_WINNER':
      return { ...state, tipOffWinner: action.winner };

    default:
      return state;
  }
}

// Helper to set a nested value by dot-path (e.g. "periods.minutesPerPeriod")
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  return (
    <GameContext.Provider value={state}>
      <GameDispatchContext.Provider value={dispatch}>
        {children}
      </GameDispatchContext.Provider>
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}

export function useGameDispatch() {
  return useContext(GameDispatchContext);
}
