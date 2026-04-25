import { useState } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';

export default function RecordScreen() {
    var game = useGame();
    var dispatch = useGameDispatch();
    var [phase, setPhase] = useState('recording');

    if (phase === 'confirm') return <ConfirmPhase game={game} dispatch={dispatch} setPhase={setPhase} />;
    if (phase === 'saved') return <SavedPhase dispatch={dispatch} />;

    var isForfeit = game.forfeit;

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={function () { dispatch({ type: 'GO_BACK' }); }}>&larr;</button>
                <h2>{game.editMode ? 'Editar' : 'Registrar'}</h2>
            </div>
            <div className="matchup-bar">
                <span className="matchup-team home">{game.homeTeam}</span>
                <span className="matchup-vs">VS</span>
                <span className="matchup-team away">{game.awayTeam}</span>
            </div>
            <div className="record-form">
                <div className="forfeit-toggle">
                    <label>
                        <input type="checkbox" checked={game.forfeit}
                            onChange={function (e) {
                                dispatch({ type: 'SET_FORFEIT', forfeit: e.target.checked, winner: null });
                                if (e.target.checked) {
                                    dispatch({ type: 'SET_SCORE', homeScore: 0, awayScore: 0 });
                                }
                            }} />
                        Forfeit
                    </label>
                </div>

                {isForfeit ? (
                    <div className="forfeit-select">
                        <div className="forfeit-prompt">Quien Gano?</div>
                        <div className="forfeit-buttons">
                            <button className={'btn-forfeit' + (game.forfeitWinner === 'home' ? ' selected' : '')}
                                onClick={function () {
                                    dispatch({ type: 'SET_FORFEIT', forfeit: true, winner: 'home' });
                                    dispatch({ type: 'SET_SCORE', homeScore: 20, awayScore: 0 });
                                }}>
                                {game.homeTeam}
                            </button>
                            <button className={'btn-forfeit' + (game.forfeitWinner === 'away' ? ' selected' : '')}
                                onClick={function () {
                                    dispatch({ type: 'SET_FORFEIT', forfeit: true, winner: 'away' });
                                    dispatch({ type: 'SET_SCORE', homeScore: 0, awayScore: 20 });
                                }}>
                                {game.awayTeam}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="score-inputs">
                        <div className="score-group">
                            <div className="form-group">
                                <label>{game.homeTeam}</label>
                                <input type="number" min="0" value={game.homeScore}
                                    onChange={function (e) {
                                        dispatch({ type: 'SET_SCORE', homeScore: parseInt(e.target.value) || 0, awayScore: game.awayScore });
                                    }} />
                            </div>
                        </div>
                        <div className="score-group">
                            <div className="form-group">
                                <label>{game.awayTeam}</label>
                                <input type="number" min="0" value={game.awayScore}
                                    onChange={function (e) {
                                        dispatch({ type: 'SET_SCORE', homeScore: game.homeScore, awayScore: parseInt(e.target.value) || 0 });
                                    }} />
                            </div>
                        </div>
                    </div>
                )}

                <div className="form-group">
                    <label>Notas</label>
                    <textarea className="notes-input" rows="2" value={game.notes}
                        onChange={function (e) { dispatch({ type: 'SET_NOTES', notes: e.target.value }); }} />
                </div>

                {game.homeScore === game.awayScore && !isForfeit && game.homeScore > 0 && (
                    <div className="form-warning">Empate - revisa el marcador</div>
                )}
            </div>
            <div className="screen-footer">
                <button className="btn btn-primary btn-large"
                    disabled={(!isForfeit && game.homeScore === game.awayScore) || (isForfeit && !game.forfeitWinner)}
                    onClick={function () { setPhase('confirm'); }}>
                    Revisar
                </button>
            </div>
        </div>
    );
}

function buildTeamInfo(name, score) {
    return {
        name: name,
        score: {
            current: score,
            perQuarter: {
                first: 0, second: 0, third: 0, fourth: 0,
                overtime: {}
            }
        },
        stats: {
            shootingBreakdown: {
                fieldGoals: {
                    totalAttempted: 0, totalMade: 0, totalMissed: 0, totalPercentage: 0,
                    '2-PointShots': { attempted: 0, made: 0, missed: 0, percentage: 0 },
                    '3-PointShots': { attempted: 0, made: 0, missed: 0, percentage: 0 }
                },
                freeThrows: { attempted: 0, made: 0, missed: 0, percentage: 0 }
            },
            assists: 0,
            defense: { steals: 0, blocks: 0 },
            rebounds: { total: 0, offensive: 0, defensive: 0 },
            turnovers: 0,
            fouls: {
                total: 0,
                perQuarter: {
                    first: { committed: 0, opponentInBonus: false },
                    second: { committed: 0, opponentInBonus: false },
                    third: { committed: 0, opponentInBonus: false },
                    fourth: { committed: 0, opponentInBonus: false },
                    overtime: {}
                }
            },
            timeouts: {
                total: { full: 0, short: 0 },
                used: { full: 0, short: 0 },
                remaining: { full: 0, short: 0 }
            }
        },
        roster: {
            full: [],
            inGame: []
        }
    };
}

function ConfirmPhase({ game, dispatch, setPhase }) {
    var [saving, setSaving] = useState(false);
    var [error, setError] = useState(null);

    var winner = game.homeScore > game.awayScore ? 'home' : 'away';
    var winnerName = winner === 'home' ? game.homeTeam : game.awayTeam;

    async function handleSubmit() {
        setSaving(true);
        setError(null);
        try {
            var { savePlayoffGame, saveRegularGame, editRegularGame } = await import('../data/api');
            var genderLabel = { varonil: 'Varonil', femenil: 'Femenil', mixto: 'Mixto' }[game.gender] || game.gender;
            var seasonDocId = 'LOMBA - ' + genderLabel + ' ' + game.division + ' - ' + game.seasonName;

            if (game.selectedSeries) {
                var now = new Date();
                var seasonDoc = game.seasonDoc;
                var leagueBlock = seasonDoc && seasonDoc.league ? seasonDoc.league : {};

                // Get the pre-existing game ID from the playoff object
                var roundData = game.selectedSeries.round === 'championship'
                    ? seasonDoc.playoffs.championship
                    : seasonDoc.playoffs[game.selectedSeries.round][game.selectedSeries.index];
                var existingGame = roundData && roundData.games[game.selectedGameIndex];
                var playoffGameId = game.editGameId || (existingGame && existingGame.id ? existingGame.id : game.homeTeam + ' vs. ' + game.awayTeam + ' - ' + now.toISOString());

                var boxScore = {
                    id: playoffGameId,
                    gameId: playoffGameId.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    type: 'simple',
                    season: seasonDocId,
                    league: {
                        fullName: leagueBlock.fullName || 'Liga Oficial Municipal de Basketball Acuña',
                        abbreviation: leagueBlock.abbreviation || 'LOMBA',
                        season: leagueBlock.season || null,
                        divisions: leagueBlock.season ? (function () {
                            var d = {};
                            var keys = Object.keys(leagueBlock.season);
                            for (var k = 0; k < keys.length; k++) {
                                var key = keys[k];
                                if (key.indexOf('divisions.') !== -1) {
                                    var parts = key.split('divisions.');
                                    var gender = parts[1];
                                    d[gender] = [leagueBlock.season[key]];
                                }
                            }
                            return d;
                        })() : null,
                    },
                    gameInfo: {
                        general: {
                            timestamp: now.toISOString(),
                            date: now.getDate() + '/' + (now.getMonth() + 1) + '/' + now.getFullYear(),
                            time: now.toLocaleTimeString(),
                            location: null,
                            status: 'final',
                        },
                        state: {
                            active: false,
                            currentQuarter: 1,
                            clock: { timeLeft: 0, perQuarter: 0, perOT: 0 },
                            winner: winner,
                            loser: winner === 'home' ? 'away' : 'home',
                            overtimes: 0,
                            possession: null,
                            possessionArrow: null,
                            forfeit: game.forfeit,
                        },
                    },
                    teamInfo: {
                        home: buildTeamInfo(game.homeTeam, game.homeScore),
                        away: buildTeamInfo(game.awayTeam, game.awayScore),
                    },
                    tipOffWinner: null,
                    team: { home: game.homeTeam, away: game.awayTeam },
                };

                var gameData = {
                    homeScore: game.homeScore,
                    awayScore: game.awayScore,
                    winner: winner,
                    forfeit: game.forfeit,
                    completion: true,
                };
                await savePlayoffGame(seasonDocId, game.selectedSeries.round, game.selectedSeries.index, game.selectedGameIndex, gameData, boxScore);
            } else {
                var now = new Date();
                var seasonDoc = game.seasonDoc;
                var leagueBlock = seasonDoc && seasonDoc.league ? seasonDoc.league : {};
                var boxScore = {
                    id: game.editGameId || (game.homeTeam + ' vs. ' + game.awayTeam + ' - ' + now.toISOString()),
                    gameId: (game.homeTeam + '-vs-' + game.awayTeam).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    type: 'simple',
                    season: seasonDocId,
                    league: {
                        fullName: leagueBlock.fullName || 'Liga Oficial Municipal de Basketball Acuña',
                        abbreviation: leagueBlock.abbreviation || 'LOMBA',
                        season: leagueBlock.season || null,
                        divisions: leagueBlock.season ? (function () {
                            var d = {};
                            var keys = Object.keys(leagueBlock.season);
                            for (var k = 0; k < keys.length; k++) {
                                var key = keys[k];
                                if (key.indexOf('divisions.') !== -1) {
                                    var parts = key.split('divisions.');
                                    var gender = parts[1];
                                    d[gender] = [leagueBlock.season[key]];
                                }
                            }
                            return d;
                        })() : null,
                    },
                    gameInfo: {
                        general: {
                            timestamp: now.toISOString(),
                            date: now.getDate() + '/' + (now.getMonth() + 1) + '/' + now.getFullYear(),
                            time: now.toLocaleTimeString(),
                            location: null,
                            status: 'final',
                        },
                        state: {
                            active: false,
                            currentQuarter: 1,
                            clock: { timeLeft: 0, perQuarter: 0, perOT: 0 },
                            winner: winner,
                            loser: winner === 'home' ? 'away' : 'home',
                            overtimes: 0,
                            possession: null,
                            possessionArrow: null,
                            forfeit: game.forfeit,
                        },
                    },
                    teamInfo: {
                        home: buildTeamInfo(game.homeTeam, game.homeScore),
                        away: buildTeamInfo(game.awayTeam, game.awayScore),
                    },
                    tipOffWinner: null,
                    team: { home: game.homeTeam, away: game.awayTeam },
                };
                if (game.editMode) {
                    var editData = {
                        homeScore: game.homeScore,
                        awayScore: game.awayScore,
                        winner: winner,
                        forfeit: game.forfeit,
                    };
                    await editRegularGame(game.editGameId, seasonDocId, editData, boxScore);
                } else {
                    await saveRegularGame(boxScore, seasonDocId, game.notes || null);
                }
            }
            // Refresh cached season doc
            var { fetchSeason } = await import('../data/api');
            var updatedDoc = await fetchSeason(seasonDocId);
            dispatch({ type: 'REFRESH_SEASON_DOC', doc: updatedDoc });

            setPhase('saved');
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    }

    return (
        <div className="screen">
            <div className="screen-header">
                <h2>Confirmar</h2>
            </div>
            <div className="confirm-card">
                <div className="confirm-matchup">
                    <div className={'confirm-team' + (winner === 'home' ? ' winner' : '')}>
                        <span className="confirm-team-name">{game.homeTeam}</span>
                        <span className="confirm-score">{game.homeScore}</span>
                        {winner === 'home' && <span className="confirm-badge">Ganador</span>}
                    </div>
                    <span className="confirm-vs">VS</span>
                    <div className={'confirm-team' + (winner === 'away' ? ' winner' : '')}>
                        <span className="confirm-team-name">{game.awayTeam}</span>
                        <span className="confirm-score">{game.awayScore}</span>
                        {winner === 'away' && <span className="confirm-badge">Ganador</span>}
                    </div>
                </div>
                {game.forfeit && <div className="confirm-forfeit">Forfeit - {winnerName} gana</div>}
                {game.notes && (
                    <div className="confirm-notes">
                        <span className="confirm-notes-label">Notas: </span>{game.notes}
                    </div>
                )}
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="confirm-actions">
                <button className="btn-back" onClick={function () { setPhase('recording'); }} disabled={saving}>Regresar</button>
                <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                    {saving ? 'Guardando...' : 'Confirmar'}
                </button>
            </div>
        </div>
    );
}

function SavedPhase({ dispatch }) {
    return (
        <div className="screen">
            <div className="screen-header">
                <h2>Guardado</h2>
            </div>
            <div className="saved-message">
                <span className="saved-check">Juego Guardado</span>
            </div>
            <div className="saved-actions">
                <button className="btn btn-secondary btn-large" onClick={function () { dispatch({ type: 'GO_BACK' }); }}>
                    Otro Juego
                </button>
                <button className="btn-back-home" onClick={function () { dispatch({ type: 'RESET' }); }}>
                    Inicio
                </button>
            </div>
        </div>
    );
}
