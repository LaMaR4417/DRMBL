import { useGame, useGameDispatch } from '../context/GameContext';

export default function CategoryScreen() {
    var game = useGame();
    var dispatch = useGameDispatch();

    var seasons = game.leagueData.leagueInfo.seasons || [];
    var season = seasons.find(function (s) { return s.name === game.seasonName; });
    var genders = season && season.data && season.data.divisions
        ? Object.keys(season.data.divisions)
        : [];

    var labels = { varonil: 'Varonil', femenil: 'Femenil', mixto: 'Mixto' };

    return (
        <div className="screen">
            <div className="screen-header">
                <button className="btn-back" onClick={function () { dispatch({ type: 'GO_BACK' }); }}>&larr;</button>
                <h2>{game.seasonName}</h2>
            </div>
            <div className="subtitle">Categoria</div>
            <div className="button-list">
                {genders.map(function (g) {
                    return (
                        <button key={g} className="btn-option"
                            onClick={function () { dispatch({ type: 'SET_GENDER', gender: g }); }}>
                            {labels[g] || g}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
