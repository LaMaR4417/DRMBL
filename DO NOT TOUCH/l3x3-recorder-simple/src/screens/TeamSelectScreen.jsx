import { useState } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchTeamRoster } from '../data/api';

export default function TeamSelectScreen() {
    const game = useGame();
    const dispatch = useGameDispatch();
    const teams = (game.season?.teams || []).slice().sort((a, b) => a.slot.localeCompare(b.slot));

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    async function pickTeam(side, teamMeta) {
        try {
            setLoading(true);
            setError(null);
            const doc = await fetchTeamRoster(teamMeta.teamID);
            dispatch({ type: side === 'home' ? 'SET_HOME_TEAM' : 'SET_AWAY_TEAM', teamMeta, teamDoc: doc });
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    const homeID = game.homeTeamMeta?.teamID || null;
    const awayID = game.awayTeamMeta?.teamID || null;
    const ready = homeID && awayID && homeID !== awayID;

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}>&larr;</button>
                <h2>Equipos</h2>
            </div>
            <div className="screen-body">
                <TeamPicker side="home" label="Local" teams={teams} selectedID={homeID} otherID={awayID} onPick={pickTeam} />
                <TeamPicker side="away" label="Visitante" teams={teams} selectedID={awayID} otherID={homeID} onPick={pickTeam} />
                {error && <div className="form-error">{error}</div>}
                {loading && <div className="loading">Cargando roster…</div>}
            </div>
            <div className="screen-footer">
                <button
                    className="btn-primary btn-large"
                    disabled={!ready || loading}
                    onClick={() => dispatch({ type: 'START_GAME' })}>
                    Iniciar Juego
                </button>
            </div>
        </div>
    );
}

function TeamPicker({ side, label, teams, selectedID, otherID, onPick }) {
    return (
        <div className="team-picker">
            <div className="team-picker-label">{label}</div>
            <div className="team-grid">
                {teams.map((t) => {
                    const isSelected = selectedID === t.teamID;
                    const isOther = otherID === t.teamID;
                    return (
                        <button
                            key={t.teamID}
                            className={'team-chip' + (isSelected ? ' selected' : '') + (isOther ? ' disabled' : '')}
                            disabled={isOther}
                            onClick={() => onPick(side, t)}>
                            <span className="team-chip-slot">{t.slot}</span>
                            <span className="team-chip-name">{t.name}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
