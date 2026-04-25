import { useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchLombaLeague } from '../data/api';

export default function SeasonSelectScreen() {
    var game = useGame();
    var dispatch = useGameDispatch();

    useEffect(function () {
        var cancelled = false;
        fetchLombaLeague().then(function (data) {
            if (!cancelled) dispatch({ type: 'SET_LEAGUE_DATA', data: data });
        }).catch(function () {});
        return function () { cancelled = true; };
    }, []);

    var leagueSeasons = game.leagueData && game.leagueData.leagueInfo && game.leagueData.leagueInfo.seasons
        ? game.leagueData.leagueInfo.seasons
        : [];

    var allSeasonDocs = game.leagueData && game.leagueData.seasons ? game.leagueData.seasons : [];

    function handleSelect(name) {
        var docs = allSeasonDocs.filter(function (d) {
            return d.league && d.league.season && d.league.season['league.seasons.name'] === name;
        });
        dispatch({ type: 'SET_SEASON', name: name, docs: docs });
    }

    return (
        <div className="screen">
            <div className="screen-header">
                <h1>LOMBA</h1>
            </div>
            <div className="subtitle">Temporada</div>
            <div className="button-list">
                {!game.leagueData && <div className="loading">Cargando...</div>}
                {leagueSeasons.map(function (s) {
                    return (
                        <button key={s.name} className="btn-option"
                            onClick={function () { handleSelect(s.name); }}>
                            {s.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
