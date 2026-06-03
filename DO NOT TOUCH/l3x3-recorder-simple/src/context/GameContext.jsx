import { createContext, useContext, useReducer } from 'react';

const GameContext = createContext(null);
const GameDispatchContext = createContext(null);

const initialState = {
    step: 0,
    season: null,
    homeTeamMeta: null,
    awayTeamMeta: null,
    homeTeamDoc: null,
    awayTeamDoc: null,
    game: null,
    status: 'idle',
    saveError: null,
    savedId: null,
};

function emptyTeamState(teamMeta, teamDoc) {
    const roster = (teamDoc?.seasons?.[0]?.roster) || [];
    return {
        name: teamMeta.name,
        teamID: teamMeta.teamID,
        slot: teamMeta.slot,
        fouls: 0,
        timeouts: 0,
        players: roster.map((p, idx) => ({
            playerID: p.playerID,
            name: p.name,
            number: '',
            onCourt: idx < 3,
            points: 0,
            by1: 0,
            by2: 0,
            by3: 0,
            fouls: 0,
        })),
    };
}

function clampNonNegative(n) { return n < 0 ? 0 : n; }

function reducer(state, action) {
    switch (action.type) {
        case 'SET_SEASON':
            return { ...state, season: action.season };
        case 'SET_HOME_TEAM':
            return { ...state, homeTeamMeta: action.teamMeta, homeTeamDoc: action.teamDoc };
        case 'SET_AWAY_TEAM':
            return { ...state, awayTeamMeta: action.teamMeta, awayTeamDoc: action.teamDoc };
        case 'START_GAME':
            return {
                ...state,
                step: 2,
                game: {
                    home: emptyTeamState(state.homeTeamMeta, state.homeTeamDoc),
                    away: emptyTeamState(state.awayTeamMeta, state.awayTeamDoc),
                },
            };
        case 'SET_STEP':
            return { ...state, step: action.step };
        case 'TOGGLE_ON_COURT': {
            const side = action.side;
            const players = state.game[side].players.map((p, i) => i === action.playerIndex ? { ...p, onCourt: !p.onCourt } : p);
            return { ...state, game: { ...state.game, [side]: { ...state.game[side], players } } };
        }
        case 'SET_PLAYER_NUMBER': {
            const side = action.side;
            const players = state.game[side].players.map((p, i) => i === action.playerIndex ? { ...p, number: action.number } : p);
            return { ...state, game: { ...state.game, [side]: { ...state.game[side], players } } };
        }
        case 'ADJUST_POINTS': {
            const { side, playerIndex, value, delta } = action;
            const key = `by${value}`;
            const players = state.game[side].players.map((p, i) => {
                if (i !== playerIndex) return p;
                const newCount = clampNonNegative(p[key] + delta);
                const actualDelta = newCount - p[key];
                return { ...p, [key]: newCount, points: p.points + actualDelta * value };
            });
            return { ...state, game: { ...state.game, [side]: { ...state.game[side], players } } };
        }
        case 'ADJUST_PLAYER_FOULS': {
            const { side, playerIndex, delta } = action;
            const players = state.game[side].players.map((p, i) => {
                if (i !== playerIndex) return p;
                return { ...p, fouls: clampNonNegative(p.fouls + delta) };
            });
            return { ...state, game: { ...state.game, [side]: { ...state.game[side], players } } };
        }
        case 'ADJUST_TEAM_FOULS': {
            const side = action.side;
            const next = clampNonNegative(state.game[side].fouls + action.delta);
            return { ...state, game: { ...state.game, [side]: { ...state.game[side], fouls: next } } };
        }
        case 'ADJUST_TEAM_TIMEOUTS': {
            const side = action.side;
            const next = clampNonNegative(state.game[side].timeouts + action.delta);
            return { ...state, game: { ...state.game, [side]: { ...state.game[side], timeouts: next } } };
        }
        case 'SET_SAVE_ERROR':
            return { ...state, saveError: action.error };
        case 'SET_STATUS':
            return { ...state, status: action.status };
        case 'SAVED':
            return { ...state, step: 4, savedId: action.id, status: 'saved' };
        case 'RESET':
            return { ...initialState, season: state.season };
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
