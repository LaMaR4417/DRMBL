import { createContext, useContext, useReducer } from 'react';

var GameContext = createContext(null);
var GameDispatchContext = createContext(null);

var initialState = {
    step: 0,
    leagueData: null,
    seasonName: null,
    gender: null,
    division: null,
    mode: null,
    seasonDocs: [],
    seasonDoc: null,
    selectedGame: null,
    selectedSeries: null,
    selectedGameIndex: null,
    homeTeam: '',
    awayTeam: '',
    homeScore: 0,
    awayScore: 0,
    forfeit: false,
    forfeitWinner: null,
    notes: '',
    status: 'idle',
    editMode: false,
    editGameId: null,
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_LEAGUE_DATA':
            return { ...state, leagueData: action.data };
        case 'SET_SEASON':
            return { ...state, seasonName: action.name, seasonDocs: action.docs || [], step: 1 };
        case 'SET_GENDER':
            return { ...state, gender: action.gender, step: 2 };
        case 'SET_DIVISION':
            return { ...state, division: action.division, step: 3 };
        case 'SET_MODE':
            return { ...state, mode: action.mode, step: 4 };
        case 'SET_SEASON_DOC':
            return { ...state, seasonDoc: action.doc };
        case 'REFRESH_SEASON_DOC':
            var updatedLeagueData = state.leagueData ? {
                ...state.leagueData,
                seasons: (state.leagueData.seasons || []).map(function (d) { return d.id === action.doc.id ? action.doc : d; })
            } : state.leagueData;
            return {
                ...state,
                seasonDoc: action.doc,
                seasonDocs: state.seasonDocs.map(function (d) { return d.id === action.doc.id ? action.doc : d; }),
                leagueData: updatedLeagueData,
            };
        case 'SELECT_SERIES':
            return {
                ...state,
                selectedSeries: action.series,
                step: 4.5,
            };
        case 'SELECT_PLAYOFF_GAME':
            return {
                ...state,
                selectedGameIndex: action.gameIndex,
                homeTeam: action.home,
                awayTeam: action.away,
                homeScore: action.homeScore || 0,
                awayScore: action.awayScore || 0,
                forfeit: action.forfeit || false,
                forfeitWinner: action.forfeitWinner || null,
                notes: '',
                editMode: action.editMode || false,
                editGameId: action.editGameId || null,
                step: 5,
            };
        case 'SELECT_EXISTING_GAME':
            return {
                ...state,
                selectedGame: action.game,
                homeTeam: action.home,
                awayTeam: action.away,
                homeScore: action.homeScore || 0,
                awayScore: action.awayScore || 0,
                forfeit: action.forfeit || false,
                forfeitWinner: action.forfeitWinner || null,
                notes: '',
                editMode: action.editMode || false,
                editGameId: action.editGameId || null,
                step: 5,
            };
        case 'SET_HOME_TEAM':
            return { ...state, homeTeam: action.name };
        case 'SET_AWAY_TEAM':
            return { ...state, awayTeam: action.name };
        case 'START_CUSTOM_GAME':
            return {
                ...state,
                homeScore: 0,
                awayScore: 0,
                forfeit: false,
                forfeitWinner: null,
                notes: '',
                step: 5,
            };
        case 'SET_SCORE':
            return { ...state, homeScore: action.homeScore, awayScore: action.awayScore };
        case 'SET_FORFEIT':
            return { ...state, forfeit: action.forfeit, forfeitWinner: action.winner || null };
        case 'SET_NOTES':
            return { ...state, notes: action.notes };
        case 'SET_STATUS':
            return { ...state, status: action.status };
        case 'GO_BACK':
            if (state.step === 0) return state;
            if (state.step === 5 && state.selectedSeries) return { ...state, step: 4.5, selectedGameIndex: null };
            if (state.step === 5) return { ...state, step: 4, selectedGame: null, selectedSeries: null, selectedGameIndex: null };
            if (state.step === 4.5) return { ...state, step: 4, selectedSeries: null };
            return { ...state, step: state.step - 1 };
        case 'RESET':
            return { ...initialState, leagueData: state.leagueData, seasonDocs: state.seasonDocs };
        default:
            return state;
    }
}

export function GameProvider({ children }) {
    var [state, dispatch] = useReducer(reducer, initialState);
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
