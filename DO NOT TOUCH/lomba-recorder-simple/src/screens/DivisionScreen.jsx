import { useGame, useGameDispatch } from '../context/GameContext';

export default function DivisionScreen() {
    var game = useGame();
    var dispatch = useGameDispatch();

    var seasons = game.leagueData.leagueInfo.seasons || [];
    var season = seasons.find(function (s) { return s.name === game.seasonName; });
    var divisions = season && season.data && season.data.divisions && season.data.divisions[game.gender]
        ? season.data.divisions[game.gender]
        : [];

    var genderLabel = { varonil: 'Varonil', femenil: 'Femenil', mixto: 'Mixto' }[game.gender] || game.gender;

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={function () { dispatch({ type: 'GO_BACK' }); }}>&larr;</button>
                <h2>{genderLabel}</h2>
            </div>
            <div className="subtitle">Division</div>
            <div className="button-list">
                {divisions.map(function (d) {
                    return (
                        <button key={d} className="btn-option"
                            onClick={function () { dispatch({ type: 'SET_DIVISION', division: d }); }}>
                            {d}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
