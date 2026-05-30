import { useGameDispatch } from '../context/GameContext';

export default function SavedScreen() {
    const dispatch = useGameDispatch();
    return (
        <div className="screen">
            <div className="screen-body saved-body">
                <div className="saved-check">✓</div>
                <div className="saved-title">Juego Guardado</div>
                <button
                    className="btn-primary btn-large"
                    onClick={() => dispatch({ type: 'RESET' })}>
                    Nuevo Juego
                </button>
            </div>
        </div>
    );
}
