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

    // Copa Beta active filters
    var cbFilters = { division: 'all', category: 'all', team: 'all' };
    var cbData = [];
    var cbLeagueDivisions = null; // from League document: { femenil: [...], varonil: [...] }

    function parseCopaBetaAPI(apiCategories) {
        return apiCategories.map(function (cat) {
            var div = cat.league && cat.league.divisions;
            var division = '';
            var category = '';
            if (div) {
                var divKeys = Object.keys(div);
                for (var dk = 0; dk < divKeys.length; dk++) {
                    var key = divKeys[dk];
                    if (div[key] && div[key].length) {
                        division = key.charAt(0).toUpperCase() + key.slice(1);
                        category = div[key][0];
                        break;
                    }
                }
            }
            return {
                division: division,
                category: category,
                groups: cat.groups || null,
                standings: cat.standings || [],
                games: cat.games || [],
                teams: cat.teams || []
            };
        });
    }

    // Use League document divisions for ordering; fall back to data-derived if unavailable
    function getCBDivisions() {
        if (cbLeagueDivisions) {
            var result = [];
            var keys = Object.keys(cbLeagueDivisions);
            for (var i = 0; i < keys.length; i++) {
                result.push(keys[i].charAt(0).toUpperCase() + keys[i].slice(1));
            }
            return result;
        }
        var seen = {};
        var fallback = [];
        for (var j = 0; j < cbData.length; j++) {
            if (!seen[cbData[j].division]) { seen[cbData[j].division] = true; fallback.push(cbData[j].division); }
        }
        return fallback;
    }

    function getCBCategories(divFilter) {
        if (cbLeagueDivisions) {
            var result = [];
            var keys = Object.keys(cbLeagueDivisions);
            for (var i = 0; i < keys.length; i++) {
                var divName = keys[i].charAt(0).toUpperCase() + keys[i].slice(1);
                if (divFilter !== 'all' && divName !== divFilter) continue;
                var cats = cbLeagueDivisions[keys[i]];
                for (var c = 0; c < cats.length; c++) {
                    result.push(cats[c]);
                }
            }
            return result;
        }
        var seen = {};
        var fallback = [];
        for (var j = 0; j < cbData.length; j++) {
            if (divFilter !== 'all' && cbData[j].division !== divFilter) continue;
            if (!seen[cbData[j].category]) { seen[cbData[j].category] = true; fallback.push(cbData[j].category); }
        }
        return fallback;
    }

    function getCBTeamsGrouped(data, divFilter, catFilter) {
        var groups = [];
        var seen = {};
        var divOrder = getCBDivisions();
        for (var di = 0; di < divOrder.length; di++) {
            var div = divOrder[di];
            for (var i = 0; i < data.length; i++) {
                if (data[i].division !== div) continue;
                if (divFilter !== 'all' && data[i].division !== divFilter) continue;
                if (catFilter !== 'all' && data[i].category !== catFilter) continue;
                var key = div + '|' + data[i].category;
                if (seen[key]) continue;
                seen[key] = true;
                var teamNames = [];
                for (var t = 0; t < data[i].teams.length; t++) {
                    var name = data[i].teams[t].name;
                    if (name) teamNames.push(name);
                }
                teamNames.sort();
                groups.push({ division: div, category: data[i].category, teams: teamNames });
            }
        }
        return groups;
    }

    // Find which division a team belongs to
    function findTeamDivision(teamName) {
        for (var i = 0; i < cbData.length; i++) {
            for (var t = 0; t < cbData[i].teams.length; t++) {
                if (cbData[i].teams[t].name === teamName) return cbData[i].division;
            }
        }
        return null;
    }

    function buildCBFilterBar() {
        var filterWrap = document.getElementById('standings-filters');
        if (!filterWrap) return;

        var divisions = getCBDivisions();
        var categories = getCBCategories(cbFilters.division);
        var teamGroups = getCBTeamsGrouped(cbData, cbFilters.division, cbFilters.category);

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

        // Team filter (grouped by division + category) — hidden when category is active
        if (cbFilters.category === 'all') {
            html += '<select class="cb-filter-select" id="cb-filter-team">';
            html += '<option value="all">All Teams</option>';
            for (var tg = 0; tg < teamGroups.length; tg++) {
                var grp = teamGroups[tg];
                html += '<optgroup label="' + grp.division + ' \u2014 ' + grp.category + '">';
                for (var t = 0; t < grp.teams.length; t++) {
                    var sel3 = cbFilters.team === grp.teams[t] ? ' selected' : '';
                    html += '<option value="' + grp.teams[t] + '"' + sel3 + '>' + grp.teams[t] + '</option>';
                }
                html += '</optgroup>';
            }
            html += '</select>';
        }

        // Clear filters button
        var hasActiveFilter = cbFilters.division !== 'all' || cbFilters.category !== 'all' || cbFilters.team !== 'all';
        if (hasActiveFilter) {
            html += '<button type="button" class="cb-filter-clear" id="cb-filter-clear">&times; Clear</button>';
        }

        html += '</div>';
        filterWrap.innerHTML = html;

        if (hasActiveFilter) {
            document.getElementById('cb-filter-clear').addEventListener('click', function () {
                cbFilters.division = 'all';
                cbFilters.category = 'all';
                cbFilters.team = 'all';
                buildCBFilterBar();
                renderCopaBeta(cbData);
            });
        }

        document.getElementById('cb-filter-division').addEventListener('change', function () {
            cbFilters.division = this.value;
            cbFilters.category = 'all';
            cbFilters.team = 'all';
            buildCBFilterBar();
            renderCopaBeta(cbData);
        });
        document.getElementById('cb-filter-category').addEventListener('change', function () {
            cbFilters.category = this.value;
            cbFilters.team = 'all';
            buildCBFilterBar();
            renderCopaBeta(cbData);
        });
        var teamEl = document.getElementById('cb-filter-team');
        if (teamEl) teamEl.addEventListener('change', function () {
            cbFilters.team = this.value;
            // When a team is selected, auto-filter to their division
            if (this.value !== 'all') {
                var teamDiv = findTeamDivision(this.value);
                if (teamDiv) {
                    cbFilters.division = teamDiv;
                    cbFilters.category = 'all';
                }
            }
            buildCBFilterBar();
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
    function resolveSlot(slotStr, standings) {
        if (!slotStr || slotStr.length > 2) return null;
        for (var i = 0; i < standings.length; i++) {
            if (standings[i].slot === slotStr) return standings[i].name;
        }
        return null;
    }

    function resolveSeed(seedStr, standings, groups) {
        if (!seedStr || seedStr === 'TBD') return 'TBD';

        // Try slot letter first (e.g. "A", "B")
        var slotName = resolveSlot(seedStr, standings);
        if (slotName) return slotName;

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

    function buildByeCard(teamName) {
        var html = '<div class="bracket-matchup bracket-bye-card">';
        html += '<div class="bracket-team bracket-winner">';
        html += '<span class="bracket-team-name">' + teamName + '</span>';
        html += '</div>';
        html += '<div class="bracket-team bracket-bye-slot">';
        html += '<span class="bracket-team-name bracket-bye-label">BYE</span>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    function buildMatchupCard(game, standings, groups, overrideTeams) {
        var homeDisplay = overrideTeams ? overrideTeams.home : resolveSeed(game.home, standings, groups);
        var awayDisplay = overrideTeams ? overrideTeams.away : resolveSeed(game.away, standings, groups);
        var completed = game.completion && game.winner;

        var html = '<div class="bracket-matchup' + (completed ? ' bracket-completed' : '') + '" data-away="' + awayDisplay + '" data-home="' + homeDisplay + '">';

        if (completed) {
            html += '<div class="bracket-final-badge">FINAL</div>';
        }

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

        // Detect unresolvable seeds → convert those semis to byes
        // A seed is unresolvable if resolveSeed returns a string still matching #N Seed
        var seedPattern = /^#\d+[A-Z]?\s+Seed$/i;
        var byeTeams = [];    // teams that get a bye (their opponent doesn't exist)
        var realSemis = [];   // semis where both teams exist

        for (var si = 0; si < semis.length; si++) {
            var s = semis[si];
            var homeResolved = resolveSeed(s.home, standings, groups);
            var awayResolved = resolveSeed(s.away, standings, groups);
            var homeIsSeed = seedPattern.test(homeResolved);
            var awayIsSeed = seedPattern.test(awayResolved);

            if (homeIsSeed && !awayIsSeed) {
                // Home team doesn't exist, away gets bye
                byeTeams.push(awayResolved);
            } else if (awayIsSeed && !homeIsSeed) {
                // Away team doesn't exist, home gets bye
                byeTeams.push(homeResolved);
            } else if (homeIsSeed && awayIsSeed) {
                // Both don't exist — skip entirely
            } else {
                realSemis.push(s);
            }
        }

        // If only 1 real semi exists and no byes detected, infer bye for #1 seed
        // This handles cases where the data only has a #2 vs #3 semi (no #1 vs #4 game exists)
        if (byeTeams.length === 0 && realSemis.length === 1 && !groups) {
            // Check that #1 seed isn't already in the semi
            var firstSeed = resolveSeed('#1 Seed', standings, groups);
            var semiHome = resolveSeed(realSemis[0].home, standings, groups);
            var semiAway = resolveSeed(realSemis[0].away, standings, groups);
            if (firstSeed !== semiHome && firstSeed !== semiAway) {
                byeTeams.push(firstSeed);
            }
        }

        var html = '<div class="bracket-section">';
        html += '<h4 class="bracket-title">Playoffs</h4>';

        // Resolve championship teams from semi winners (use realSemis + byeTeams)
        var champTeams = null;
        if (championship && !championship.completion) {
            var champHome = 'TBD';
            var champAway = 'TBD';

            if (byeTeams.length > 0 && realSemis.length === 1) {
                // Bye format derived from 2 semis where one had missing team
                champHome = byeTeams[0];
                champAway = realSemis[0].winner || 'TBD';
            } else if (byeTeams.length === 0 && realSemis.length === 1 && semis.length === 1) {
                // Original bye format (only 1 semi in data, e.g. Universitario)
                champHome = resolveSeed('#1 Seed', standings, groups);
                champAway = realSemis[0].winner || 'TBD';
            } else if (realSemis.length >= 2) {
                champAway = realSemis[0].winner || 'TBD';
                champHome = realSemis[1].winner || 'TBD';
            }

            champTeams = { home: champHome, away: champAway };
        }

        // Count total bracket entries (byes + real semis)
        var totalSemiSlots = byeTeams.length + realSemis.length;

        if (totalSemiSlots === 0 && championship) {
            // Only a championship (no semis)
            html += '<div class="bracket-layout bracket-final-only">';
            html += '<div class="bracket-round bracket-round-final">';
            html += '<div class="bracket-round-label">Championship</div>';
            html += buildMatchupCard(championship, standings, groups, champTeams);
            html += '</div>';
            html += '</div>';
        } else if (totalSemiSlots >= 1 && championship) {
            var hasByes = byeTeams.length > 0;
            var semiLabel = realSemis.length === 1 && byeTeams.length <= 1 ? 'Semi-Final' : 'Semi-Finals';

            html += '<div class="bracket-layout' + (hasByes ? ' bracket-bye' : '') + '">';
            html += '<div class="bracket-round bracket-round-semis">';
            html += '<div class="bracket-round-label">' + semiLabel + '</div>';

            // Render bye cards first, then real semis
            for (var bi = 0; bi < byeTeams.length; bi++) {
                html += buildByeCard(byeTeams[bi]);
            }
            for (var ri = 0; ri < realSemis.length; ri++) {
                html += buildMatchupCard(realSemis[ri], standings, groups);
            }

            html += '</div>';
            html += '<div class="bracket-connectors">';
            html += '<div class="bracket-connector-top"></div>';
            html += '<div class="bracket-connector-bot"></div>';
            html += '</div>';
            html += '<div class="bracket-round bracket-round-final">';
            html += '<div class="bracket-round-label">Championship</div>';
            html += buildMatchupCard(championship, standings, groups, champTeams);
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function showCopaBetaShimmer() {
        var container = document.getElementById('standings-content');
        var html = '';
        // Generic shimmer — just show a few placeholder tables
        for (var i = 0; i < 3; i++) {
            html += '<div class="category-section">';
            html += '<h3 class="category-header"><span class="shimmer-block" style="width:120px;height:18px;display:inline-block"></span></h3>';
            html += buildShimmerTable(4);
            html += '</div>';
        }
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

        // Group by division
        var divOrder = getCBDivisions();
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

            // Sort categories by League document order
            var leagueKey = divName.toLowerCase();
            var catOrder = cbLeagueDivisions && cbLeagueDivisions[leagueKey] ? cbLeagueDivisions[leagueKey] : null;
            if (catOrder) {
                cats.sort(function (a, b) {
                    var ai = catOrder.indexOf(a.category);
                    var bi = catOrder.indexOf(b.category);
                    if (ai === -1) ai = 999;
                    if (bi === -1) bi = 999;
                    return ai - bi;
                });
            }

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
                if (data && data.leagueInfo && data.leagueInfo.divisions) {
                    cbLeagueDivisions = data.leagueInfo.divisions;
                }
                if (data && data.categories && data.categories.length > 0) {
                    cbData = parseCopaBetaAPI(data.categories);
                } else {
                    cbData = [];
                }
                buildCBFilterBar();
                renderCopaBeta(cbData);
                startLivePolling();
            })
            .catch(function () {
                cbData = [];
                var container = document.getElementById('standings-content');
                container.innerHTML = '<div class="standings-empty">Unable to load standings. Please try again later.</div>';
            });
    }

    // ── Live game polling for brackets ──

    var liveGames = {};
    var liveTimer = null;

    function liveKey(away, home) {
        return away + '~' + home;
    }

    function formatClock(seconds) {
        if (seconds == null) return '';
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function fetchLiveGames() {
        return fetch('/api/live-game')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var map = {};
                var games = data.games || [];
                for (var i = 0; i < games.length; i++) {
                    var g = games[i];
                    if (!g.boxScore || !g.boxScore.teamInfo) continue;
                    var bs = g.boxScore;
                    var status = bs.gameInfo && bs.gameInfo.general ? bs.gameInfo.general.status : '';
                    if (status === 'final') continue;
                    var away = bs.teamInfo.away.name;
                    var home = bs.teamInfo.home.name;
                    var quarter = bs.gameInfo && bs.gameInfo.state ? bs.gameInfo.state.currentQuarter : null;
                    var clock = bs.gameInfo && bs.gameInfo.state && bs.gameInfo.state.clock ? bs.gameInfo.state.clock.timeLeft : null;
                    map[liveKey(away, home)] = {
                        awayScore: bs.teamInfo.away.score.current,
                        homeScore: bs.teamInfo.home.score.current,
                        quarter: quarter,
                        clock: clock
                    };
                }
                liveGames = map;
                return map;
            })
            .catch(function () { return {}; });
    }

    function updateLiveBrackets() {
        var cards = document.querySelectorAll('.bracket-matchup[data-away][data-home]');
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var key = liveKey(card.getAttribute('data-away'), card.getAttribute('data-home'));
            var live = liveGames[key];
            var badgeEl = card.querySelector('.bracket-live-badge');

            if (live) {
                card.classList.add('bracket-live');

                // Add LIVE badge if not present
                if (!badgeEl) {
                    var badge = document.createElement('div');
                    badge.className = 'bracket-live-badge';
                    badge.textContent = 'LIVE';
                    card.insertBefore(badge, card.firstChild);
                }

                // Update scores on each team line
                var teamEls = card.querySelectorAll('.bracket-team');
                var scores = [live.awayScore, live.homeScore];
                for (var t = 0; t < teamEls.length && t < 2; t++) {
                    var scoreEl = teamEls[t].querySelector('.bracket-score');
                    if (!scoreEl) {
                        scoreEl = document.createElement('span');
                        scoreEl.className = 'bracket-score bracket-live-score';
                        teamEls[t].appendChild(scoreEl);
                    }
                    scoreEl.textContent = scores[t];
                    scoreEl.classList.add('bracket-live-score');
                }

                // Update or add quarter/clock info
                var infoEl = card.querySelector('.bracket-live-info');
                var qLabel = live.quarter ? 'Q' + live.quarter : '';
                var clockLabel = live.clock != null ? formatClock(live.clock) : '';
                var liveInfo = qLabel + (clockLabel ? ' ' + clockLabel : '');
                if (!infoEl) {
                    infoEl = document.createElement('div');
                    infoEl.className = 'bracket-live-info';
                    card.appendChild(infoEl);
                }
                infoEl.textContent = liveInfo;
            } else if (card.classList.contains('bracket-live')) {
                // Game was live but no longer — transition to FINAL
                if (badgeEl) badgeEl.remove();
                var oldInfo = card.querySelector('.bracket-live-info');
                if (oldInfo) oldInfo.remove();
                card.classList.remove('bracket-live');
                card.classList.add('bracket-completed');

                // Grab last known scores before removing live score elements
                var liveScoreEls = card.querySelectorAll('.bracket-live-score');
                var lastScores = [];
                for (var ls = 0; ls < liveScoreEls.length; ls++) {
                    lastScores.push(liveScoreEls[ls].textContent);
                    liveScoreEls[ls].classList.remove('bracket-live-score');
                }

                // Add FINAL badge
                var finalBadge = document.createElement('div');
                finalBadge.className = 'bracket-final-badge';
                finalBadge.textContent = 'FINAL';
                card.insertBefore(finalBadge, card.firstChild);
            }
        }
    }

    function startLivePolling() {
        if (liveTimer) return;
        fetchLiveGames().then(function () { updateLiveBrackets(); });
        liveTimer = setInterval(function () {
            fetchLiveGames().then(function () { updateLiveBrackets(); });
        }, 20000);
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
