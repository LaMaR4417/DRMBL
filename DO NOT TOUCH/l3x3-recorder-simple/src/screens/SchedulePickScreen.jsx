import { useState } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchTeamRoster } from '../data/api';

function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    return `${hour12}:${m} ${suffix}`;
}

export default function SchedulePickScreen() {
    const game = useGame();
    const dispatch = useGameDispatch();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const season = game.season;
    const schedule = season?.schedule || [];

    const allGames = [];
    for (const dg of schedule) {
        for (const g of (dg.games || [])) {
            allGames.push({ ...g, _date: dg.date });
        }
    }
    const open = allGames.filter((g) => !g.completion);
    const done = allGames.filter((g) => g.completion);

    open.sort((a, b) => {
        if (a.round !== b.round) return (a.round || 0) - (b.round || 0);
        if (a.time !== b.time) return (a.time || '').localeCompare(b.time || '');
        return (a.court || 0) - (b.court || 0);
    });

    const grouped = {};
    for (const g of open) {
        const key = `R${g.round}·${g.time}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(g);
    }

    async function pick(g) {
        try {
            setLoading(true);
            setError(null);
            const [homeDoc, awayDoc] = await Promise.all([
                fetchTeamRoster(g.homeTeamID),
                fetchTeamRoster(g.awayTeamID),
            ]);
            dispatch({ type: 'SET_HOME_TEAM', teamMeta: { teamID: g.homeTeamID, name: g.home, slot: '' }, teamDoc: homeDoc });
            dispatch({ type: 'SET_AWAY_TEAM', teamMeta: { teamID: g.awayTeamID, name: g.away, slot: '' }, teamDoc: awayDoc });
            dispatch({ type: 'START_GAME' });
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}>&larr;</button>
                <h2>Selecciona Juego</h2>
            </div>
            <div className="screen-body">
                {open.length === 0 && done.length === 0 && <div className="loading">No hay juegos en la programación</div>}
                {open.length === 0 && done.length > 0 && <div className="loading">Todos los juegos están completos</div>}

                {Object.keys(grouped).map((key) => {
                    const games = grouped[key];
                    const r = games[0].round;
                    const t = games[0].time;
                    return (
                        <div key={key} className="schedule-group">
                            <div className="schedule-group-header">
                                <span className="schedule-group-round">Ronda {r}</span>
                                <span className="schedule-group-time">{formatTime(t)}</span>
                            </div>
                            <div className="schedule-list">
                                {games.map((g) => (
                                    <button key={g.id} className="schedule-card" onClick={() => pick(g)} disabled={loading}>
                                        <div className="schedule-card-court">C{g.court}</div>
                                        <div className="schedule-card-match">
                                            <div className="schedule-card-team">
                                                {g.homeSeed != null && <span className="seed">#{g.homeSeed}</span>}
                                                <span className="schedule-card-name">{g.home}</span>
                                            </div>
                                            <div className="schedule-card-vs">vs</div>
                                            <div className="schedule-card-team">
                                                {g.awaySeed != null && <span className="seed">#{g.awaySeed}</span>}
                                                <span className="schedule-card-name">{g.away}</span>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {loading && <div className="loading">Cargando rosters…</div>}
                {error && <div className="form-error">{error}</div>}

                {done.length > 0 && (
                    <div className="schedule-group">
                        <div className="schedule-group-header dim">
                            <span className="schedule-group-round">Completados</span>
                            <span className="schedule-group-time">{done.length}</span>
                        </div>
                        <div className="schedule-list">
                            {done.map((g) => (
                                <div key={g.id} className="schedule-card done">
                                    <div className="schedule-card-court">C{g.court}</div>
                                    <div className="schedule-card-match">
                                        <div className="schedule-card-team">
                                            <span className="schedule-card-name">{g.home}</span>
                                            <span className="final-score">{g.homeScore}</span>
                                        </div>
                                        <div className="schedule-card-vs">vs</div>
                                        <div className="schedule-card-team">
                                            <span className="schedule-card-name">{g.away}</span>
                                            <span className="final-score">{g.awayScore}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
