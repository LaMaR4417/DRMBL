import { useGame, useGameDispatch } from '../context/GameContext';

export default function SeriesGamesScreen() {
    var game = useGame();
    var dispatch = useGameDispatch();
    var playoffs = game.seasonDoc && game.seasonDoc.playoffs;

    if (!playoffs || !game.selectedSeries) return null;

    var round = game.selectedSeries.round;
    var index = game.selectedSeries.index;

    var seriesData;
    if (round === 'championship') {
        seriesData = playoffs.championship;
    } else {
        seriesData = playoffs[round][index];
    }

    if (!seriesData) return null;

    var games = seriesData.games || [];
    var isOver = seriesData.seed1Wins >= 2 || seriesData.seed2Wins >= 2;

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={function () { dispatch({ type: 'GO_BACK' }); }}>&larr;</button>
                <h2>{'#' + seriesData.seed1 + ' ' + seriesData.name1 + ' vs #' + seriesData.seed2 + ' ' + seriesData.name2}</h2>
            </div>
            <div className="matchup-bar">
                <span className="matchup-team home">{seriesData.name1}</span>
                <span className="matchup-vs">{seriesData.seed1Wins + ' - ' + seriesData.seed2Wins}</span>
                <span className="matchup-team away">{seriesData.name2}</span>
            </div>
            <div className="subtitle">Juegos</div>
            <div className="button-list">
                {games.map(function (g, gi) {
                    if (g === null) {
                        return (
                            <button key={gi} className="btn-option completed" disabled>
                                <span>{'Juego ' + (gi + 1) + ' — No necesario'}</span>
                            </button>
                        );
                    }

                    var completed = g.completion;

                    // Game 3 only available if series is 1-1
                    var game3Locked = gi === 2 && !(seriesData.seed1Wins === 1 && seriesData.seed2Wins === 1);

                    var disabled = completed || isOver || game3Locked;

                    var label = 'Juego ' + (gi + 1);
                    if (completed) {
                        label += ' — ' + g.home + ' ' + g.homeScore + ', ' + g.away + ' ' + g.awayScore + (g.forfeit ? ' (FF)' : '');
                    } else if (game3Locked) {
                        label += ' — Pendiente';
                    } else {
                        label += ' — ' + g.away + ' vs ' + g.home;
                    }

                    return (
                        <div key={gi} className="game-row">
                            <button className={'btn-option' + (completed ? ' completed' : '') + (disabled && !completed ? ' dimmed' : '')}
                                disabled={disabled || completed}
                                onClick={function () {
                                    dispatch({
                                        type: 'SELECT_PLAYOFF_GAME',
                                        gameIndex: gi,
                                        home: g.home,
                                        away: g.away,
                                    });
                                }}>
                                <span>{label}</span>
                                {completed && <span className="series-score">Final</span>}
                            </button>
                            {completed && (
                                <button className="btn btn-edit"
                                    onClick={function () {
                                        var fw = null;
                                        if (g.forfeit) fw = g.winner;
                                        dispatch({
                                            type: 'SELECT_PLAYOFF_GAME',
                                            gameIndex: gi,
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
                })}
            </div>
        </div>
    );
}
