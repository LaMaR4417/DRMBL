import { useState } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { saveGame } from '../data/api';

function totalScore(team) {
    return team.players.reduce((s, p) => s + p.points, 0);
}

function buildBoxScore(state) {
    const now = new Date();
    const dateMD = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    const dateISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const home = state.game.home;
    const away = state.game.away;
    const homeScore = totalScore(home);
    const awayScore = totalScore(away);
    const winner = homeScore === awayScore ? 'tie' : (homeScore > awayScore ? 'home' : 'away');

    const teamShape = (t, total) => ({
        name: t.name,
        score: {
            current: total,
            by1: t.players.reduce((s, p) => s + p.by1, 0),
            by2: t.players.reduce((s, p) => s + p.by2, 0),
            by3: t.players.reduce((s, p) => s + p.by3, 0),
        },
        timeouts: { used: t.timeouts },
        fouls: { team: t.fouls },
        players: t.players.map((p) => ({
            playerID: p.playerID,
            name: p.name,
            number: p.number || null,
            points: p.points,
            by1: p.by1,
            by2: p.by2,
            by3: p.by3,
            onCourtAtEnd: p.onCourt,
        })),
    });

    const seasonId = state.season?.id;
    const leagueBlock = state.season?.league || {};

    return {
        type: '3x3',
        recorder: 'l3x3-live-tap-simple',
        season: seasonId,
        league: {
            fullName: leagueBlock.fullName || 'Liga Oficial Municipal de Basketball Acuña 3x3',
            abbreviation: leagueBlock.abbreviation || 'L3X3',
            season: leagueBlock.season || null,
        },
        gameInfo: {
            general: {
                timestamp: now.toISOString(),
                date: dateMD,
                time: now.toLocaleTimeString(),
                location: null,
                status: 'final',
            },
            state: {
                winner,
                loser: winner === 'tie' ? null : (winner === 'home' ? 'away' : 'home'),
                forfeit: false,
            },
        },
        teamInfo: {
            home: teamShape(home, homeScore),
            away: teamShape(away, awayScore),
        },
        team: { home: home.name, away: away.name },
        leagueID: 'L3X3',
        seasonID: seasonId,
        homeTeamID: home.teamID,
        awayTeamID: away.teamID,
        gameDate: dateISO,
        gameTimestamp: now.toISOString(),
    };
}

export default function ConfirmScreen() {
    const game = useGame();
    const dispatch = useGameDispatch();
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);

    const home = game.game.home;
    const away = game.game.away;
    const homeScore = totalScore(home);
    const awayScore = totalScore(away);
    const tie = homeScore === awayScore;

    async function handleSave() {
        setSaving(true);
        setErr(null);
        try {
            const boxScore = buildBoxScore(game);
            const res = await saveGame(boxScore);
            dispatch({ type: 'SAVED', id: res.id });
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}>&larr;</button>
                <h2>Confirmar</h2>
            </div>
            <div className="screen-body">
                <div className="confirm-card">
                    <div className="confirm-row">
                        <span className="confirm-team-name">{home.name}</span>
                        <span className={'confirm-score' + (homeScore > awayScore ? ' winner' : '')}>{homeScore}</span>
                    </div>
                    <div className="confirm-row">
                        <span className="confirm-team-name">{away.name}</span>
                        <span className={'confirm-score' + (awayScore > homeScore ? ' winner' : '')}>{awayScore}</span>
                    </div>
                    {tie && <div className="form-warning">Empate — revisa los puntos</div>}
                </div>

                <TeamSummary team={home} />
                <TeamSummary team={away} />

                {err && <div className="form-error">{err}</div>}
            </div>
            <div className="screen-footer">
                <button
                    className="btn-primary btn-large"
                    disabled={saving || tie}
                    onClick={handleSave}>
                    {saving ? 'Guardando…' : 'Guardar'}
                </button>
            </div>
        </div>
    );
}

function TeamSummary({ team }) {
    return (
        <div className="team-summary">
            <div className="team-summary-header">{team.name}</div>
            <table className="summary-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Jugador</th>
                        <th>1</th>
                        <th>2</th>
                        <th>3</th>
                        <th>Pts</th>
                    </tr>
                </thead>
                <tbody>
                    {team.players.map((p) => (
                        <tr key={p.playerID}>
                            <td>{p.number || '—'}</td>
                            <td>{p.name}</td>
                            <td>{p.by1}</td>
                            <td>{p.by2}</td>
                            <td>{p.by3}</td>
                            <td><strong>{p.points}</strong></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="team-summary-totals">
                Faltas: <strong>{team.fouls}</strong> · Tiempos: <strong>{team.timeouts}</strong>
            </div>
        </div>
    );
}
