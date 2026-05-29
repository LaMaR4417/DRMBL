import { useState } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';

export default function GameSelectScreen() {
    var game = useGame();
    var dispatch = useGameDispatch();

    if (game.mode === 'playoffs') return <PlayoffSelect />;
    if (game.mode === 'existing') return <ExistingSelect />;
    if (game.mode === 'new') return <NewGameSelect />;
    return null;
}

function PlayoffSelect() {
    var game = useGame();
    var dispatch = useGameDispatch();
    var playoffs = game.seasonDoc && game.seasonDoc.playoffs;

    var rounds = [
        { key: 'quarterFinals', label: 'Cuartos de Final', series: playoffs ? playoffs.quarterFinals : [] },
        { key: 'semiFinals', label: 'Semifinales', series: playoffs ? playoffs.semiFinals : [] },
        { key: 'championship', label: 'Final', series: playoffs ? [playoffs.championship] : [] },
    ];

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={function () { dispatch({ type: 'GO_BACK' }); }}>&larr;</button>
                <h2>Playoffs</h2>
            </div>
            {rounds.map(function (round) {
                var seriesList = round.series || [];
                return (
                    <div key={round.key}>
                        <div className="subtitle">{round.label}</div>
                        <div className="button-list">
                            {seriesList.map(function (series, si) {
                                if (!series) return null;
                                var isEmpty = !series.name1 && !series.name2;
                                var isOver = !isEmpty && (series.seed1Wins >= 2 || series.seed2Wins >= 2);

                                if (isEmpty) {
                                    return (
                                        <button key={si} className="btn-option" disabled style={{opacity: 0.25}}>
                                            <span>TBD vs TBD</span>
                                            <span className="series-score">0-0</span>
                                        </button>
                                    );
                                }

                                return (
                                    <div key={si} className="game-row">
                                        <button className={'btn-option' + (isOver ? ' completed' : '')}
                                            disabled={isOver}
                                            onClick={function () {
                                                dispatch({
                                                    type: 'SELECT_SERIES',
                                                    series: { round: round.key, index: si },
                                                });
                                            }}>
                                            <span className="series-teams">{'#' + series.seed1 + ' ' + series.name1 + ' vs #' + series.seed2 + ' ' + series.name2}</span>
                                            <span className="series-score">{series.seed1Wins + '-' + series.seed2Wins}</span>
                                        </button>
                                        {isOver && (
                                            <button className="btn btn-edit"
                                                onClick={function () {
                                                    dispatch({
                                                        type: 'SELECT_SERIES',
                                                        series: { round: round.key, index: si },
                                                    });
                                                }}>
                                                Editar
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function ExistingSelect() {
    var game = useGame();
    var dispatch = useGameDispatch();
    var [teamFilter, setTeamFilter] = useState('all');

    var schedule = game.seasonDoc && game.seasonDoc.schedule ? game.seasonDoc.schedule : [];
    var seasonTeams = (game.seasonDoc && game.seasonDoc.teams ? game.seasonDoc.teams : []).slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });

    var allGames = [];
    for (var i = 0; i < schedule.length; i++) {
        var dateGroup = schedule[i];
        var games = dateGroup.games || [];
        for (var j = 0; j < games.length; j++) {
            allGames.push({ ...games[j], _date: dateGroup.date });
        }
    }

    var filtered = teamFilter === 'all'
        ? allGames
        : allGames.filter(function (g) { return g.home === teamFilter || g.away === teamFilter; });

    var unplayed = filtered.filter(function (g) { return !(g.completion === true || (g.winner && g.winner !== '')); });
    var played = filtered.filter(function (g) { return g.completion === true || (g.winner && g.winner !== ''); });

    // Sort by team displayed on the left of the row
    unplayed.sort(function (a, b) { return a.away.localeCompare(b.away) || a.home.localeCompare(b.home); });
    played.sort(function (a, b) { return a.home.localeCompare(b.home) || a.away.localeCompare(b.away); });

    function renderGame(g, key) {
        var completed = g.completion === true || (g.winner && g.winner !== '');
        return (
            <div key={key} className="game-row">
                <button className={'btn-option' + (completed ? ' completed' : '')}
                    disabled={completed}
                    onClick={function () {
                        dispatch({
                            type: 'SELECT_EXISTING_GAME',
                            game: g,
                            home: g.home,
                            away: g.away,
                            editMode: !completed,
                            editGameId: !completed ? g.id : null,
                        });
                    }}>
                    {completed
                        ? <span>{g.home + ' ' + g.homeScore + ' - ' + g.awayScore + ' ' + g.away + (g.forfeit ? ' (FF)' : '')}</span>
                        : <span>{g.away + ' vs ' + g.home}</span>
                    }
                </button>
                {completed && (
                    <button className="btn btn-edit"
                        onClick={function () {
                            var fw = null;
                            if (g.forfeit) fw = g.winner;
                            dispatch({
                                type: 'SELECT_EXISTING_GAME',
                                game: g,
                                home: g.home,
                                away: g.away,
                                homeScore: g.homeScore,
                                awayScore: g.awayScore,
                                forfeit: g.forfeit,
                                forfeitWinner: fw,
                                editMode: true,
                                editGameId: g.id,
                            });
                        }}>
                        Editar
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={function () { dispatch({ type: 'GO_BACK' }); }}>&larr;</button>
                <h2>Juego Existente</h2>
            </div>

            {seasonTeams.length > 0 && (
                <div className="filter-chips">
                    <button className={'chip' + (teamFilter === 'all' ? ' selected' : '')}
                        onClick={function () { setTeamFilter('all'); }}>Todos</button>
                    {seasonTeams.map(function (t) {
                        return (
                            <button key={t.teamID || t.name}
                                className={'chip' + (teamFilter === t.name ? ' selected' : '')}
                                onClick={function () { setTeamFilter(t.name); }}>
                                {t.name}
                            </button>
                        );
                    })}
                </div>
            )}

            {filtered.length === 0 && <div className="loading">No hay juegos</div>}

            {unplayed.length > 0 && (
                <>
                    <div className="subtitle">Por Jugar ({unplayed.length})</div>
                    <div className="button-list">
                        {unplayed.map(function (g, i) { return renderGame(g, 'u' + i); })}
                    </div>
                </>
            )}

            {played.length > 0 && (
                <>
                    <div className="subtitle">Jugados ({played.length})</div>
                    <div className="button-list">
                        {played.map(function (g, i) { return renderGame(g, 'p' + i); })}
                    </div>
                </>
            )}
        </div>
    );
}

function NewGameSelect() {
    var game = useGame();
    var dispatch = useGameDispatch();
    var teams = game.seasonDoc && game.seasonDoc.teams ? game.seasonDoc.teams : [];

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={function () { dispatch({ type: 'GO_BACK' }); }}>&larr;</button>
                <h2>Nuevo Juego</h2>
            </div>
            <div className="team-select-content">
                <div className="team-select-half">
                    <div className="team-select-label">Local</div>
                    <div className="team-list">
                        {teams.map(function (t) {
                            return (
                                <button key={t.teamID} className={'btn btn-team' + (game.homeTeam === t.name ? ' selected' : '')}
                                    disabled={game.awayTeam === t.name}
                                    onClick={function () { dispatch({ type: 'SET_HOME_TEAM', name: t.name }); }}>
                                    <span className="team-slot">{t.slot}</span>
                                    <span className="team-name">{t.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="team-select-half">
                    <div className="team-select-label">Visitante</div>
                    <div className="team-list">
                        {teams.map(function (t) {
                            return (
                                <button key={t.teamID} className={'btn btn-team' + (game.awayTeam === t.name ? ' selected' : '')}
                                    disabled={game.homeTeam === t.name}
                                    onClick={function () { dispatch({ type: 'SET_AWAY_TEAM', name: t.name }); }}>
                                    <span className="team-slot">{t.slot}</span>
                                    <span className="team-name">{t.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
            {game.homeTeam && game.awayTeam && (
                <div className="screen-footer">
                    <button className="btn btn-primary btn-large"
                        onClick={function () { dispatch({ type: 'START_CUSTOM_GAME' }); }}>
                        Iniciar
                    </button>
                </div>
            )}
        </div>
    );
}
