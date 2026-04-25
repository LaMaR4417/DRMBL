import { useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';

export default function ModeSelectScreen() {
    var game = useGame();
    var dispatch = useGameDispatch();

    var genderLabel = { varonil: 'Varonil', femenil: 'Femenil', mixto: 'Mixto' }[game.gender] || game.gender;
    var seasonDocId = 'LOMBA - ' + genderLabel + ' ' + game.division + ' - ' + game.seasonName;

    useEffect(function () {
        var doc = game.seasonDocs.find(function (d) { return d.id === seasonDocId; });
        if (doc) dispatch({ type: 'SET_SEASON_DOC', doc: doc });
    }, [seasonDocId]);

    var modes = [
        { key: 'new', label: 'Nuevo Juego' },
        { key: 'playoffs', label: 'Playoffs' },
        { key: 'existing', label: 'Juego Existente' },
    ];

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={function () { dispatch({ type: 'GO_BACK' }); }}>&larr;</button>
                <h2>{game.division}</h2>
            </div>
            <div className="subtitle">{genderLabel + ' - ' + game.division}</div>
            <div className="button-list">
                {!game.seasonDoc && <div className="loading">Cargando...</div>}
                {game.seasonDoc && modes.map(function (m) {
                    var disabled = false;
                    if (m.key === 'playoffs' && (!game.seasonDoc.playoffs || !game.seasonDoc.playoffs.quarterFinals)) {
                        disabled = true;
                    }
                    if (m.key === 'existing' && (!game.seasonDoc.schedule || game.seasonDoc.schedule.length === 0)) {
                        disabled = true;
                    }
                    return (
                        <button key={m.key} className="btn-option" disabled={disabled}
                            onClick={function () { dispatch({ type: 'SET_MODE', mode: m.key }); }}>
                            {m.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
