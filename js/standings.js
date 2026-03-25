(function () {
    // ── League mode detection ──
    function getLeagueFromPath() {
        var path = window.location.pathname.replace(/\/+$/, '');
        if (path.indexOf('/standings/copa-beta') !== -1) return 'copa-beta';
        return 'drmbl';
    }

    var CURRENT_LEAGUE = getLeagueFromPath();

    function initLeagueSwitcher() {
        var btns = document.querySelectorAll('.league-btn');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].getAttribute('data-league') === CURRENT_LEAGUE) {
                btns[i].classList.add('active');
            }
        }
    }

    // ── Shimmer skeleton ──
    function buildShimmerTable(rowCount) {
        var html = '<div class="standings-table-wrap">';
        html += '<table class="standings-table">';
        html += '<thead><tr>';
        html += '<th class="col-rank">#</th>';
        html += '<th class="col-team">Team</th>';
        html += '<th class="col-w">W</th>';
        html += '<th class="col-l">L</th>';
        html += '<th class="col-diff">+/-</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        for (var i = 0; i < rowCount; i++) {
            html += '<tr class="standings-shimmer-row">';
            html += '<td class="col-rank"><span class="shimmer-block shimmer-rank"></span></td>';
            html += '<td class="col-team"><span class="shimmer-block shimmer-team"></span></td>';
            html += '<td class="col-w"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '<td class="col-l"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '<td class="col-diff"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '</tr>';
        }

        html += '</tbody></table></div>';
        return html;
    }

    // ── Shared table builder ──
    function buildStandingsTable(standings, playoffCutoff) {
        var html = '<div class="standings-table-wrap">';
        html += '<table class="standings-table">';
        html += '<thead><tr>';
        html += '<th class="col-rank">#</th>';
        html += '<th class="col-team">Team</th>';
        html += '<th class="col-w">W</th>';
        html += '<th class="col-l">L</th>';
        html += '<th class="col-diff">+/-</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        for (var i = 0; i < standings.length; i++) {
            var team = standings[i];
            var isTBD = team.name === 'TBD';
            var rank = i + 1;
            var isPlayoff = playoffCutoff && rank <= playoffCutoff;

            var rowCls = '';
            if (isTBD) rowCls += ' tbd-team';
            if (isPlayoff) rowCls += ' playoff-team';

            var winsDisplay = team.wins || 0;
            var lossesDisplay = team.losses || 0;
            var pd = team.pointDiff !== undefined ? team.pointDiff : (team.pointDifferential !== undefined ? team.pointDifferential : null);

            var diffDisplay = '--';
            var diffCls = 'col-diff';
            if (pd !== null && pd !== undefined) {
                if (winsDisplay > 0 || lossesDisplay > 0 || pd !== 0) {
                    diffDisplay = pd > 0 ? '+' + pd : '' + pd;
                    if (pd > 0) diffCls += ' positive';
                    else if (pd < 0) diffCls += ' negative';
                }
            }

            html += '<tr class="' + rowCls.trim() + '">';
            html += '<td class="col-rank">' + rank + '</td>';
            html += '<td class="col-team">' + team.name + '</td>';
            html += '<td class="col-w">' + winsDisplay + '</td>';
            html += '<td class="col-l">' + lossesDisplay + '</td>';
            html += '<td class="' + diffCls + '">' + diffDisplay + '</td>';
            html += '</tr>';
        }

        html += '</tbody></table></div>';
        return html;
    }

    // ── DRMBL ──────────────────────────────────────────

    var DRMBL_FALLBACK = [
        { slot: 'A', name: 'Wonderland', wins: 0, losses: 0, pointDiff: 0 },
        { slot: 'B', name: 'DR Elite', wins: 0, losses: 0, pointDiff: 0 },
        { slot: 'C', name: 'Air Ballers', wins: 0, losses: 0, pointDiff: 0 },
        { slot: 'D', name: 'bbl crackin', wins: 0, losses: 0, pointDiff: 0 },
        { slot: 'E', name: 'Del Rio Heat', wins: 0, losses: 0, pointDiff: 0 },
        { slot: 'F', name: 'The Reapers', wins: 0, losses: 0, pointDiff: 0 },
        { slot: 'G', name: 'R. Blitz', wins: 0, losses: 0, pointDiff: 0 },
        { slot: 'H', name: 'Kings', wins: 0, losses: 0, pointDiff: 0 },
        { slot: 'I', name: 'Dunk Dynasty', wins: 0, losses: 0, pointDiff: 0 }
    ];

    function showDRMBLShimmer() {
        var container = document.getElementById('standings-content');
        container.innerHTML = buildShimmerTable(9);
    }

    function renderDRMBL(standings) {
        var container = document.getElementById('standings-content');
        if (!standings || standings.length === 0) {
            container.innerHTML = '<div class="standings-empty">No teams registered yet.</div>';
            return;
        }
        container.innerHTML = buildStandingsTable(standings, 4);
    }

    function loadDRMBL() {
        showDRMBLShimmer();

        fetch('/api/seasons')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.seasons) {
                    var drmblSeason = null;
                    for (var i = 0; i < data.seasons.length; i++) {
                        var s = data.seasons[i];
                        if (s.league && s.league.abbreviation === 'DRMBL') {
                            drmblSeason = s;
                            break;
                        }
                    }

                    if (drmblSeason && drmblSeason.standings && drmblSeason.standings.length > 0) {
                        renderDRMBL(drmblSeason.standings);
                    } else {
                        renderDRMBL(DRMBL_FALLBACK);
                    }
                } else {
                    renderDRMBL(DRMBL_FALLBACK);
                }
            })
            .catch(function () {
                renderDRMBL(DRMBL_FALLBACK);
            });
    }

    // ── COPA BETA ──────────────────────────────────────

    var CB_FALLBACK = [
        {
            division: 'Femenil', category: '2009-2010', groups: null, games: [
                { round: 'Semi 1', home: '#4 Seed', away: '#1 Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Semi 2', home: '#3 Seed', away: '#2 Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Championship', home: 'TBD', away: 'TBD', winner: '', homeScore: null, awayScore: null, completion: false }
            ],
            standings: [
                { slot: 'A', name: 'Ballers', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'B', name: 'Linces', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'C', name: "Tota's Team", wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'D', name: 'Genesis Dream', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'E', name: 'Leones', wins: 0, losses: 0, pointDiff: 0 }
            ]
        },
        {
            division: 'Femenil', category: '2013-2014', groups: null, games: [
                { round: 'Semi 1', home: '#4 Seed', away: '#1 Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Semi 2', home: '#3 Seed', away: '#2 Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Championship', home: 'TBD', away: 'TBD', winner: '', homeScore: null, awayScore: null, completion: false }
            ],
            standings: [
                { slot: 'A', name: 'Linces', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'B', name: 'Spurs Acuna', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'C', name: 'Spurs Monclova', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'D', name: 'Alfa y Omega', wins: 0, losses: 0, pointDiff: 0 }
            ]
        },
        {
            division: 'Varonil', category: '2009-2010',
            groups: { A: ['D', 'A', 'B', 'G', 'I'], B: ['F', 'C', 'E', 'H'] }, games: [
                { round: 'Semi 1', home: '#2B Seed', away: '#1A Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Semi 2', home: '#2A Seed', away: '#1B Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Championship', home: 'TBD', away: 'TBD', winner: '', homeScore: null, awayScore: null, completion: false }
            ],
            standings: [
                { slot: 'A', name: 'Betas', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'B', name: 'Leones', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'C', name: 'Carneros', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'D', name: 'Sigmas', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'E', name: 'Ballers', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'F', name: 'West Gold', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'G', name: 'Sonics', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'H', name: 'Selectivo', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'I', name: 'Lakers', wins: 0, losses: 0, pointDiff: 0 }
            ]
        },
        {
            division: 'Varonil', category: '2011-2012',
            groups: { A: ['B', 'E', 'F'], B: ['D', 'C', 'A'] }, games: [
                { round: 'Semi 1', home: '#2B Seed', away: '#1A Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Semi 2', home: '#2A Seed', away: '#1B Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Championship', home: 'TBD', away: 'TBD', winner: '', homeScore: null, awayScore: null, completion: false }
            ],
            standings: [
                { slot: 'A', name: 'Ballers', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'B', name: 'Centauros', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'C', name: 'Titanes', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'D', name: 'Alfa y Omega', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'E', name: 'Betas', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'F', name: "Tota's Boys", wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'G', name: 'Leones', wins: 0, losses: 0, pointDiff: 0 }
            ]
        },
        {
            division: 'Varonil', category: '2013-2014', groups: null, games: [
                { round: 'Semi 1', home: '#4 Seed', away: '#1 Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Semi 2', home: '#3 Seed', away: '#2 Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Championship', home: 'TBD', away: 'TBD', winner: '', homeScore: null, awayScore: null, completion: false }
            ],
            standings: [
                { slot: 'A', name: 'Betas', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'B', name: 'Leones', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'C', name: 'Spurs Monclova', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'D', name: 'Alfa y Omega', wins: 0, losses: 0, pointDiff: 0 }
            ]
        },
        {
            division: 'Varonil', category: '2015-2016',
            groups: { A: ['F', 'A', 'C'], B: ['B', 'D', 'E'] }, games: [
                { round: 'Semi 1', home: '#2B Seed', away: '#1A Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Semi 2', home: '#2A Seed', away: '#1B Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Championship', home: 'TBD', away: 'TBD', winner: '', homeScore: null, awayScore: null, completion: false }
            ],
            standings: [
                { slot: 'A', name: 'Ballers', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'B', name: 'Betas', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'C', name: 'Centauros', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'D', name: 'Leones', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'E', name: 'Nets', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'F', name: 'Alfa y Omega', wins: 0, losses: 0, pointDiff: 0 }
            ]
        },
        {
            division: 'Varonil', category: '2017-2018',
            groups: { A: ['A', 'B', 'C'], B: ['D', 'E', 'F'] }, games: [
                { round: 'Semi 1', home: '#2B Seed', away: '#1A Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Semi 2', home: '#2A Seed', away: '#1B Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Championship', home: 'TBD', away: 'TBD', winner: '', homeScore: null, awayScore: null, completion: false }
            ],
            standings: [
                { slot: 'A', name: 'Betas', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'B', name: 'Centauros', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'C', name: 'Eagle Pass', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'D', name: 'Nets', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'E', name: 'Spurs Acuna', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'F', name: 'Alfa y Omega', wins: 0, losses: 0, pointDiff: 0 }
            ]
        },
        {
            division: 'Varonil', category: 'Universitario', groups: null, games: [
                { round: 'Semi', home: '#3 Seed', away: '#2 Seed', winner: '', homeScore: null, awayScore: null, completion: false },
                { round: 'Championship', home: 'TBD', away: 'TBD', winner: '', homeScore: null, awayScore: null, completion: false }
            ],
            standings: [
                { slot: 'A', name: 'Del Rio', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'B', name: 'Lakers', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'C', name: 'Halcones', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'D', name: 'Selectivo', wins: 0, losses: 0, pointDiff: 0 },
                { slot: 'E', name: 'Tec NM Toros', wins: 0, losses: 0, pointDiff: 0 }
            ]
        }
    ];

    // Copa Beta active filters
    var cbFilters = { division: 'all', category: 'all' };
    var cbData = [];

    function parseCopaBetaAPI(apiCategories) {
        return apiCategories.map(function (cat) {
            var div = cat.league && cat.league.divisions;
            var division = '';
            var category = '';
            if (div) {
                if (div.femenil && div.femenil.length) { division = 'Femenil'; category = div.femenil[0]; }
                else if (div.varonil && div.varonil.length) { division = 'Varonil'; category = div.varonil[0]; }
            }
            return {
                division: division,
                category: category,
                groups: cat.groups || null,
                standings: cat.standings || [],
                games: cat.games || []
            };
        });
    }

    function getCBDivisions(data) {
        var seen = {};
        var result = [];
        for (var i = 0; i < data.length; i++) {
            if (!seen[data[i].division]) { seen[data[i].division] = true; result.push(data[i].division); }
        }
        return result;
    }

    function getCBCategories(data, divFilter) {
        var seen = {};
        var result = [];
        for (var i = 0; i < data.length; i++) {
            if (divFilter !== 'all' && data[i].division !== divFilter) continue;
            if (!seen[data[i].category]) { seen[data[i].category] = true; result.push(data[i].category); }
        }
        return result;
    }

    function buildCBFilterBar() {
        var filterWrap = document.getElementById('standings-filters');
        if (!filterWrap) return;

        var divisions = getCBDivisions(cbData);
        var categories = getCBCategories(cbData, cbFilters.division);

        var html = '<div class="cb-filters">';

        // Division filter
        html += '<select class="cb-filter-select" id="cb-filter-division">';
        html += '<option value="all">All Divisions</option>';
        for (var d = 0; d < divisions.length; d++) {
            var sel = cbFilters.division === divisions[d] ? ' selected' : '';
            html += '<option value="' + divisions[d] + '"' + sel + '>' + divisions[d] + '</option>';
        }
        html += '</select>';

        // Category filter
        html += '<select class="cb-filter-select" id="cb-filter-category">';
        html += '<option value="all">All Categories</option>';
        for (var c = 0; c < categories.length; c++) {
            var sel2 = cbFilters.category === categories[c] ? ' selected' : '';
            html += '<option value="' + categories[c] + '"' + sel2 + '>' + categories[c] + '</option>';
        }
        html += '</select>';

        // Clear filters button
        var hasActiveFilter = cbFilters.division !== 'all' || cbFilters.category !== 'all';
        if (hasActiveFilter) {
            html += '<button type="button" class="cb-filter-clear" id="cb-filter-clear">&times; Clear</button>';
        }

        html += '</div>';
        filterWrap.innerHTML = html;

        if (hasActiveFilter) {
            document.getElementById('cb-filter-clear').addEventListener('click', function () {
                cbFilters.division = 'all';
                cbFilters.category = 'all';
                buildCBFilterBar();
                renderCopaBeta(cbData);
            });
        }

        document.getElementById('cb-filter-division').addEventListener('change', function () {
            cbFilters.division = this.value;
            cbFilters.category = 'all';
            buildCBFilterBar();
            renderCopaBeta(cbData);
        });
        document.getElementById('cb-filter-category').addEventListener('change', function () {
            cbFilters.category = this.value;
            renderCopaBeta(cbData);
        });
    }

    // Split a flat standings array into group sub-tables using the groups object
    function splitByGroups(standings, groups) {
        if (!groups) return null;
        var groupKeys = Object.keys(groups).sort();
        var result = [];
        for (var g = 0; g < groupKeys.length; g++) {
            var key = groupKeys[g];
            var slots = groups[key];
            // Build a set for fast lookup
            var slotSet = {};
            for (var s = 0; s < slots.length; s++) { slotSet[slots[s]] = true; }
            // Filter standings to only teams in this group, preserving array order
            var groupStandings = [];
            for (var t = 0; t < standings.length; t++) {
                if (slotSet[standings[t].slot]) {
                    groupStandings.push(standings[t]);
                }
            }
            result.push({ key: key, standings: groupStandings });
        }
        return result;
    }

    // ── Seed resolution ──
    // Parses seed strings like "#1 Seed", "#2A Seed", "#1B Seed"
    // and resolves to actual team name from standings/groups
    function resolveSeed(seedStr, standings, groups) {
        if (!seedStr || seedStr === 'TBD') return 'TBD';

        // Match patterns: "#1 Seed", "#1A Seed", "#2B Seed", "#4 Seed"
        var match = seedStr.match(/^#(\d+)([A-Z])?\s+Seed$/i);
        if (!match) return seedStr; // not a seed string, return as-is

        var seedNum = parseInt(match[1]);
        var groupKey = match[2] ? match[2].toUpperCase() : null;

        if (groupKey && groups) {
            // Grouped seed: find the Nth team in that group
            var groupSplit = splitByGroups(standings, groups);
            if (groupSplit) {
                for (var g = 0; g < groupSplit.length; g++) {
                    if (groupSplit[g].key === groupKey) {
                        var idx = seedNum - 1;
                        if (idx >= 0 && idx < groupSplit[g].standings.length) {
                            return groupSplit[g].standings[idx].name;
                        }
                    }
                }
            }
        } else {
            // Flat seed: Nth team overall
            var idx2 = seedNum - 1;
            if (idx2 >= 0 && idx2 < standings.length) {
                return standings[idx2].name;
            }
        }

        return seedStr; // couldn't resolve
    }

    // ── Bracket builder ──
    function getPlayoffGames(games) {
        var playoffs = [];
        for (var i = 0; i < games.length; i++) {
            if (games[i].round) playoffs.push(games[i]);
        }
        return playoffs;
    }

    function buildMatchupCard(game, standings, groups) {
        var homeDisplay = game.winner ? game.home : resolveSeed(game.home, standings, groups);
        var awayDisplay = game.winner ? game.away : resolveSeed(game.away, standings, groups);
        var completed = game.completion && game.winner;

        var html = '<div class="bracket-matchup' + (completed ? ' bracket-completed' : '') + '">';

        // Away team (top line)
        var awayIsWinner = completed && game.winner === awayDisplay;
        html += '<div class="bracket-team' + (awayIsWinner ? ' bracket-winner' : '') + '">';
        html += '<span class="bracket-team-name">' + awayDisplay + '</span>';
        if (completed) {
            html += '<span class="bracket-score">' + (game.awayScore !== null ? game.awayScore : '') + '</span>';
        }
        html += '</div>';

        // Home team (bottom line)
        var homeIsWinner = completed && game.winner === homeDisplay;
        html += '<div class="bracket-team' + (homeIsWinner ? ' bracket-winner' : '') + '">';
        html += '<span class="bracket-team-name">' + homeDisplay + '</span>';
        if (completed) {
            html += '<span class="bracket-score">' + (game.homeScore !== null ? game.homeScore : '') + '</span>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    function buildBracket(games, standings, groups) {
        var playoffGames = getPlayoffGames(games);
        if (playoffGames.length === 0) return '';

        // Separate semis and championship
        var semis = [];
        var championship = null;
        for (var i = 0; i < playoffGames.length; i++) {
            var r = playoffGames[i].round.toLowerCase();
            if (r === 'championship') {
                championship = playoffGames[i];
            } else if (r.indexOf('semi') !== -1) {
                semis.push(playoffGames[i]);
            }
        }

        // Sort semis: Semi 1 before Semi 2, "Semi" alone first
        semis.sort(function (a, b) {
            return a.round.localeCompare(b.round);
        });

        var html = '<div class="bracket-section">';
        html += '<h4 class="bracket-title">Playoffs</h4>';

        if (semis.length === 0 && championship) {
            // Only a championship (no semis)
            html += '<div class="bracket-layout bracket-final-only">';
            html += '<div class="bracket-round bracket-round-final">';
            html += '<div class="bracket-round-label">Championship</div>';
            html += buildMatchupCard(championship, standings, groups);
            html += '</div>';
            html += '</div>';
        } else if (semis.length === 1 && championship) {
            // One semi + championship (bye format, e.g. Universitario)
            html += '<div class="bracket-layout bracket-bye">';
            html += '<div class="bracket-round bracket-round-semis">';
            html += '<div class="bracket-round-label">Semi-Final</div>';
            html += buildMatchupCard(semis[0], standings, groups);
            html += '</div>';
            html += '<div class="bracket-connector bracket-connector-single"></div>';
            html += '<div class="bracket-round bracket-round-final">';
            html += '<div class="bracket-round-label">Championship</div>';
            html += buildMatchupCard(championship, standings, groups);
            html += '</div>';
            html += '</div>';
        } else if (semis.length >= 2 && championship) {
            // Two semis + championship (standard)
            html += '<div class="bracket-layout">';
            html += '<div class="bracket-round bracket-round-semis">';
            html += '<div class="bracket-round-label">Semi-Finals</div>';
            html += buildMatchupCard(semis[0], standings, groups);
            html += buildMatchupCard(semis[1], standings, groups);
            html += '</div>';
            html += '<div class="bracket-connectors">';
            html += '<div class="bracket-connector-top"></div>';
            html += '<div class="bracket-connector-bot"></div>';
            html += '</div>';
            html += '<div class="bracket-round bracket-round-final">';
            html += '<div class="bracket-round-label">Championship</div>';
            html += buildMatchupCard(championship, standings, groups);
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function showCopaBetaShimmer() {
        var container = document.getElementById('standings-content');
        var html = '';

        // Shimmer for Femenil (2 categories, no groups)
        html += '<div class="standings-division">';
        html += '<h2 class="division-header">Femenil</h2>';
        html += '<div class="category-section">';
        html += '<h3 class="category-header">2009-2010</h3>';
        html += buildShimmerTable(5);
        html += '</div>';
        html += '<div class="category-section">';
        html += '<h3 class="category-header">2013-2014</h3>';
        html += buildShimmerTable(4);
        html += '</div>';
        html += '</div>';

        // Shimmer for Varonil (6 categories, some with groups)
        html += '<div class="standings-division">';
        html += '<h2 class="division-header">Varonil</h2>';
        var varonilCounts = [4, 4, 4, 3, 3, 5];
        var varonilLabels = ['2009-2010', '2011-2012', '2013-2014', '2015-2016', '2017-2018', 'Universitario'];
        for (var i = 0; i < varonilCounts.length; i++) {
            html += '<div class="category-section">';
            html += '<h3 class="category-header">' + varonilLabels[i] + '</h3>';
            html += buildShimmerTable(varonilCounts[i]);
            html += '</div>';
        }
        html += '</div>';

        container.innerHTML = html;
    }

    function renderCopaBeta(categories) {
        var container = document.getElementById('standings-content');

        if (!categories || categories.length === 0) {
            container.innerHTML = '<div class="standings-empty">No standings available.</div>';
            return;
        }

        // Apply filters
        var filtered = [];
        for (var f = 0; f < categories.length; f++) {
            var cat = categories[f];
            if (cbFilters.division !== 'all' && cat.division !== cbFilters.division) continue;
            if (cbFilters.category !== 'all' && cat.category !== cbFilters.category) continue;
            filtered.push(cat);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="standings-empty">No standings match the selected filters.</div>';
            return;
        }

        // Group by division, ordered: Femenil first, then Varonil
        var divOrder = ['Femenil', 'Varonil'];
        var grouped = {};
        for (var i = 0; i < filtered.length; i++) {
            var c = filtered[i];
            if (!grouped[c.division]) grouped[c.division] = [];
            grouped[c.division].push(c);
        }

        var html = '';
        for (var d = 0; d < divOrder.length; d++) {
            var divName = divOrder[d];
            var cats = grouped[divName];
            if (!cats || cats.length === 0) continue;

            // Sort categories: numeric age ranges first (ascending), then text
            cats.sort(function (a, b) {
                var aNum = parseInt(a.category);
                var bNum = parseInt(b.category);
                if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                if (!isNaN(aNum)) return -1;
                if (!isNaN(bNum)) return 1;
                return a.category.localeCompare(b.category);
            });

            html += '<div class="standings-division">';
            html += '<h2 class="division-header">' + divName + '</h2>';

            for (var ci = 0; ci < cats.length; ci++) {
                var cat = cats[ci];
                var catId = (cat.division + '-' + cat.category).toLowerCase().replace(/\s+/g, '-');
                html += '<div class="category-section" id="cat-' + catId + '">';
                html += '<h3 class="category-header">' + cat.category + '</h3>';

                // Check if this category has groups
                var groupSplit = splitByGroups(cat.standings, cat.groups);

                if (groupSplit) {
                    // Render each group as a separate sub-table
                    html += '<div class="groups-container">';
                    for (var gi = 0; gi < groupSplit.length; gi++) {
                        var grp = groupSplit[gi];
                        html += '<div class="group-section">';
                        html += '<h4 class="group-header">Group ' + grp.key + '</h4>';
                        // Top 2 per group advance
                        html += buildStandingsTable(grp.standings, 2);
                        html += '</div>';
                    }
                    html += '</div>';
                } else {
                    // No groups — top 4 advance
                    html += buildStandingsTable(cat.standings, 4);
                }

                // Playoff bracket
                if (cat.games && cat.games.length > 0) {
                    html += buildBracket(cat.games, cat.standings, cat.groups);
                }

                html += '</div>';
            }

            html += '</div>';
        }

        container.innerHTML = html;
    }

    function loadCopaBeta() {
        showCopaBetaShimmer();

        fetch('/api/seasons?league=copa-beta')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.categories && data.categories.length > 0) {
                    cbData = parseCopaBetaAPI(data.categories);
                } else {
                    cbData = CB_FALLBACK;
                }
                buildCBFilterBar();
                renderCopaBeta(cbData);
            })
            .catch(function () {
                cbData = CB_FALLBACK;
                buildCBFilterBar();
                renderCopaBeta(cbData);
            });
    }

    // ── Init ──

    function init() {
        initLeagueSwitcher();

        if (CURRENT_LEAGUE === 'copa-beta') {
            loadCopaBeta();
        } else {
            loadDRMBL();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
