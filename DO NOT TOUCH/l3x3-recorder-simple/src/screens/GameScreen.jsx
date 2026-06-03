import { useGame, useGameDispatch } from '../context/GameContext';

export default function GameScreen() {
    const game = useGame();
    const dispatch = useGameDispatch();
    if (!game.game) return null;

    const home = game.game.home;
    const away = game.game.away;

    const homeScore = home.players.reduce((s, p) => s + p.points, 0);
    const awayScore = away.players.reduce((s, p) => s + p.points, 0);

    return (
        <div className="screen game-screen">
            <header className="scoreboard">
                <button className="btn-back inline" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>&larr;</button>
                <div className="scoreboard-team">
                    <div className="scoreboard-team-name">{home.name}</div>
                    <div className="scoreboard-team-score">{homeScore}</div>
                </div>
                <div className="scoreboard-dash">—</div>
                <div className="scoreboard-team">
                    <div className="scoreboard-team-score">{awayScore}</div>
                    <div className="scoreboard-team-name">{away.name}</div>
                </div>
            </header>

            <div className="teams-pane">
                <TeamPanel side="home" team={home} dispatch={dispatch} />
                <TeamPanel side="away" team={away} dispatch={dispatch} reverse />
            </div>

            <div className="game-footer">
                <button
                    className="btn-primary btn-large"
                    onClick={() => dispatch({ type: 'SET_STEP', step: 3 })}>
                    Finalizar Juego
                </button>
            </div>
        </div>
    );
}

function TeamPanel({ side, team, dispatch, reverse }) {
    return (
        <section className={'team-panel' + (reverse ? ' reverse' : '')}>
            <div className="team-panel-header">{team.name}</div>
            <table className="player-grid">
                <thead>
                    <tr>
                        <th className="col-encancha">En Cancha</th>
                        <th className="col-number">#</th>
                        <th className="col-player">Jugador</th>
                        <th className="col-pts">1</th>
                        <th className="col-pts">2</th>
                        <th className="col-pts">3</th>
                        <th className="col-pts">F</th>
                    </tr>
                </thead>
                <tbody>
                    {team.players.map((p, i) => (
                        <tr key={p.playerID} className={p.onCourt ? 'on-court' : 'on-bench'}>
                            <td className="col-encancha">
                                <button
                                    className={'encancha-toggle' + (p.onCourt ? ' on' : '')}
                                    onClick={() => dispatch({ type: 'TOGGLE_ON_COURT', side, playerIndex: i })}
                                    aria-label={p.onCourt ? 'Sacar a banca' : 'Meter a la cancha'}>
                                    {p.onCourt ? '✓' : ''}
                                </button>
                            </td>
                            <td className="col-number">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength="3"
                                    className="number-input"
                                    value={p.number}
                                    placeholder="—"
                                    onChange={(e) => dispatch({ type: 'SET_PLAYER_NUMBER', side, playerIndex: i, number: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })}
                                />
                            </td>
                            <td className="col-player">{p.name}</td>
                            <ScoreCell side={side} playerIndex={i} value={1} count={p.by1} dispatch={dispatch} />
                            <ScoreCell side={side} playerIndex={i} value={2} count={p.by2} dispatch={dispatch} />
                            <ScoreCell side={side} playerIndex={i} value={3} count={p.by3} dispatch={dispatch} />
                            <FoulCell side={side} playerIndex={i} count={p.fouls} dispatch={dispatch} />
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="team-totals">
                <TeamCounter label="Faltas" value={team.fouls} onAdjust={(d) => dispatch({ type: 'ADJUST_TEAM_FOULS', side, delta: d })} />
                <TeamCounter label="Tiempos" value={team.timeouts} onAdjust={(d) => dispatch({ type: 'ADJUST_TEAM_TIMEOUTS', side, delta: d })} max={2} />
            </div>
        </section>
    );
}

function ScoreCell({ side, playerIndex, value, count, dispatch }) {
    return (
        <td className="col-pts">
            <div className="score-cell">
                <button
                    className="score-btn minus"
                    onClick={() => dispatch({ type: 'ADJUST_POINTS', side, playerIndex, value, delta: -1 })}
                    aria-label={`-${value}`}>
                    −{value}
                </button>
                <div className="score-count">{count}</div>
                <button
                    className="score-btn plus"
                    onClick={() => dispatch({ type: 'ADJUST_POINTS', side, playerIndex, value, delta: +1 })}
                    aria-label={`+${value}`}>
                    +{value}
                </button>
            </div>
        </td>
    );
}

function FoulCell({ side, playerIndex, count, dispatch }) {
    return (
        <td className="col-pts">
            <div className="score-cell">
                <button
                    className="score-btn minus"
                    onClick={() => dispatch({ type: 'ADJUST_PLAYER_FOULS', side, playerIndex, delta: -1 })}
                    aria-label="−1 falta">
                    −F
                </button>
                <div className="score-count">{count}</div>
                <button
                    className="score-btn plus"
                    onClick={() => dispatch({ type: 'ADJUST_PLAYER_FOULS', side, playerIndex, delta: +1 })}
                    aria-label="+1 falta">
                    +F
                </button>
            </div>
        </td>
    );
}

function TeamCounter({ label, value, onAdjust, max }) {
    return (
        <div className="team-counter">
            <div className="team-counter-label">{label}</div>
            <div className="team-counter-controls">
                <button className="counter-btn minus" onClick={() => onAdjust(-1)} aria-label={`${label} −1`}>−</button>
                <div className="team-counter-value">{value}{typeof max === 'number' ? <span className="team-counter-max">/{max}</span> : null}</div>
                <button className="counter-btn plus" onClick={() => onAdjust(+1)} aria-label={`${label} +1`}>+</button>
            </div>
        </div>
    );
}
