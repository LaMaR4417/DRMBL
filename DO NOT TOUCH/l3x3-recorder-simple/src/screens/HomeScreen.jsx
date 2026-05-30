import { useGame, useGameDispatch } from '../context/GameContext';

export default function HomeScreen() {
    const game = useGame();
    const dispatch = useGameDispatch();

    return (
        <div className="screen">
            <div className="hero">
                <h1 className="hero-title">L3X3</h1>
                <div className="hero-subtitle">Recorder Simple</div>
            </div>
            <div className="screen-body">
                {!game.season && <div className="loading">Cargando temporada…</div>}
                {game.season && (
                    <>
                        <div className="season-label">{game.season.id}</div>
                        <button
                            className="btn-primary btn-large"
                            onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
                            Nuevo Juego
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
