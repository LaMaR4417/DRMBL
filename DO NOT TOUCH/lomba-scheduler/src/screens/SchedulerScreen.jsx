import { useState, useRef } from 'react';
import { saveSchedule } from '../data/api';

var TIME_SLOTS = ['7:00 PM', '8:00 PM', '9:00 PM'];
var COURTS = ['Court A', 'Court B'];

function collectUnscheduledGames(seasons) {
    var games = [];
    for (var i = 0; i < seasons.length; i++) {
        var s = seasons[i];
        var divLabel = '';
        if (s.league && s.league.season) {
            var keys = Object.keys(s.league.season);
            for (var k = 0; k < keys.length; k++) {
                if (keys[k].indexOf('divisions.') !== -1) {
                    var gender = keys[k].split('divisions.')[1];
                    gender = gender.charAt(0).toUpperCase() + gender.slice(1);
                    divLabel = gender + ' — ' + s.league.season[keys[k]];
                }
            }
        }

        // Playoff games
        if (s.playoffs) {
            var rounds = [
                { key: 'quarterFinals', label: 'QF', series: s.playoffs.quarterFinals || [] },
                { key: 'semiFinals', label: 'SF', series: s.playoffs.semiFinals || [] },
                { key: 'championship', label: 'Final', series: s.playoffs.championship ? [s.playoffs.championship] : [] }
            ];
            for (var r = 0; r < rounds.length; r++) {
                var seriesList = rounds[r].series;
                for (var si = 0; si < seriesList.length; si++) {
                    var series = seriesList[si];
                    if (!series || (!series.name1 && !series.name2)) continue;
                    var seriesGames = series.games || [];
                    for (var gi = 0; gi < seriesGames.length; gi++) {
                        var gm = seriesGames[gi];
                        if (gm === null) continue;
                        if (gm.completion) continue;
                        if (gm.date) continue; // already scheduled
                        games.push({
                            id: gm.id,
                            seasonId: s.id,
                            type: 'playoff',
                            round: rounds[r].key,
                            seriesIndex: si,
                            gameIndex: gi,
                            home: gm.home,
                            away: gm.away,
                            label: rounds[r].label + ' G' + (gi + 1),
                            division: divLabel,
                        });
                    }
                }
            }
        }

        // Regular season games without dates
        if (s.schedule) {
            for (var di = 0; di < s.schedule.length; di++) {
                var dateGroup = s.schedule[di];
                var dateGames = dateGroup.games || [];
                for (var dgi = 0; dgi < dateGames.length; dgi++) {
                    var dg = dateGames[dgi];
                    if (dg.winner || dg.completion) continue;
                    if (dg.date || dg.time) continue;
                    games.push({
                        id: dg.id,
                        seasonId: s.id,
                        type: 'regular',
                        home: dg.home,
                        away: dg.away,
                        label: 'Regular',
                        division: divLabel,
                    });
                }
            }
        }
    }
    return games;
}

function divColor(division) {
    if (!division) return 'rgba(255,255,255,0.1)';
    var d = division.toLowerCase();
    if (d.indexOf('primera') !== -1) return 'rgba(200,164,92,0.3)';
    if (d.indexOf('segunda') !== -1 && d.indexOf(' a') !== -1) return 'rgba(76,175,80,0.3)';
    if (d.indexOf('segunda') !== -1 && d.indexOf(' b') !== -1) return 'rgba(33,150,243,0.3)';
    if (d.indexOf('tercera') !== -1) return 'rgba(156,39,176,0.3)';
    if (d.indexOf('empresarial') !== -1) return 'rgba(255,87,34,0.3)';
    if (d.indexOf('femenil') !== -1) return 'rgba(233,30,99,0.3)';
    return 'rgba(255,255,255,0.1)';
}

export default function SchedulerScreen({ leagueData }) {
    var seasons = leagueData.seasons || [];
    var allGames = collectUnscheduledGames(seasons);

    var [date, setDate] = useState('');
    var [grid, setGrid] = useState({}); // key: "courtIdx-timeIdx" → game
    var [pool, setPool] = useState(allGames);
    var [saving, setSaving] = useState(false);
    var [saved, setSaved] = useState(false);
    var dragItem = useRef(null);

    function gridKey(courtIdx, timeIdx) { return courtIdx + '-' + timeIdx; }

    function handleDragStart(game) {
        dragItem.current = game;
    }

    function handleDropOnSlot(courtIdx, timeIdx) {
        var game = dragItem.current;
        if (!game) return;
        dragItem.current = null;

        var key = gridKey(courtIdx, timeIdx);

        // If slot already has a game, put it back in pool
        var newGrid = { ...grid };
        var newPool = pool.filter(function (g) { return g.id !== game.id; });

        // Remove game from any other slot
        for (var k in newGrid) {
            if (newGrid[k] && newGrid[k].id === game.id) {
                delete newGrid[k];
            }
        }

        // If dropping on occupied slot, swap back to pool
        if (newGrid[key]) {
            newPool.push(newGrid[key]);
        }

        newGrid[key] = game;
        setGrid(newGrid);
        setPool(newPool);
    }

    function handleDropOnPool() {
        var game = dragItem.current;
        if (!game) return;
        dragItem.current = null;

        // Remove from grid
        var newGrid = { ...grid };
        for (var k in newGrid) {
            if (newGrid[k] && newGrid[k].id === game.id) {
                delete newGrid[k];
            }
        }

        // Add back to pool if not already there
        var inPool = pool.some(function (g) { return g.id === game.id; });
        if (!inPool) {
            setPool([...pool, game]);
        }
        setGrid(newGrid);
    }

    function handleDragOver(e) { e.preventDefault(); }

    async function handleSave() {
        if (!date) return;
        setSaving(true);

        var dateParts = date.split('-');
        var dateObj = {
            year: parseInt(dateParts[0]),
            month: parseInt(dateParts[1]),
            date: parseInt(dateParts[2])
        };

        var assignments = [];
        for (var k in grid) {
            var game = grid[k];
            if (!game) continue;
            var parts = k.split('-');
            var courtIdx = parseInt(parts[0]);
            var timeIdx = parseInt(parts[1]);
            assignments.push({
                gameId: game.id,
                seasonId: game.seasonId,
                type: game.type,
                round: game.round || null,
                seriesIndex: game.seriesIndex != null ? game.seriesIndex : null,
                gameIndex: game.gameIndex != null ? game.gameIndex : null,
                date: dateObj,
                time: TIME_SLOTS[timeIdx],
                court: COURTS[courtIdx],
            });
        }

        try {
            await saveSchedule(assignments);
            setSaved(true);
        } catch (e) {
            alert('Error: ' + e.message);
        }
        setSaving(false);
    }

    function renderGameCard(game, draggable) {
        return (
            <div key={game.id}
                className="sched-card"
                draggable={draggable}
                onDragStart={function () { handleDragStart(game); }}
                style={{ borderLeftColor: divColor(game.division) }}>
                <div className="sched-card-division">{game.division}</div>
                <div className="sched-card-matchup">{game.away} vs {game.home}</div>
                <div className="sched-card-label">{game.label}</div>
            </div>
        );
    }

    if (saved) {
        return (
            <div className="screen">
                <div className="screen-header"><h1>Scheduler</h1></div>
                <div className="saved-message">
                    <span className="saved-check">Horario Guardado</span>
                </div>
                <div className="saved-actions">
                    <button className="btn btn-secondary btn-large" onClick={function () { window.location.reload(); }}>
                        Nuevo Horario
                    </button>
                </div>
            </div>
        );
    }

    var gridCount = 0;
    for (var gk in grid) { if (grid[gk]) gridCount++; }

    return (
        <div className="screen sched-screen">
            <div className="screen-header">
                <h1>Scheduler</h1>
            </div>

            <div className="sched-date-bar">
                <label>Fecha</label>
                <input type="date" value={date} onChange={function (e) { setDate(e.target.value); }} />
            </div>

            <div className="sched-body">
                <div className="sched-pool"
                    onDragOver={handleDragOver}
                    onDrop={handleDropOnPool}>
                    <div className="sched-pool-header">Juegos Disponibles ({pool.length})</div>
                    {pool.length === 0 && <div className="sched-empty">No hay juegos por programar</div>}
                    {pool.map(function (g) { return renderGameCard(g, true); })}
                </div>

                <div className="sched-grid">
                    <div className="sched-grid-header">
                        <div className="sched-time-label"></div>
                        {COURTS.map(function (c, ci) {
                            return <div key={ci} className="sched-court-header">{c}</div>;
                        })}
                    </div>
                    {TIME_SLOTS.map(function (time, ti) {
                        return (
                            <div key={ti} className="sched-grid-row">
                                <div className="sched-time-label">{time}</div>
                                {COURTS.map(function (court, ci) {
                                    var key = gridKey(ci, ti);
                                    var slotGame = grid[key];
                                    return (
                                        <div key={ci} className="sched-slot"
                                            onDragOver={handleDragOver}
                                            onDrop={function () { handleDropOnSlot(ci, ti); }}>
                                            {slotGame ? renderGameCard(slotGame, true) : <span className="sched-slot-empty">Arrastrar aqui</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="screen-footer">
                <button className="btn btn-primary btn-large"
                    disabled={!date || gridCount === 0 || saving}
                    onClick={handleSave}>
                    {saving ? 'Guardando...' : 'Guardar Horario'}
                </button>
            </div>
        </div>
    );
}
