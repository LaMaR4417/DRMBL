(function () {
    // ── League mode detection ──
    function getLeagueFromPath() {
        var path = window.location.pathname.replace(/\/+$/, '');
        if (path.indexOf('/standings/copa-beta') !== -1) return 'copa-beta';
        if (path.indexOf('/standings/lomba') !== -1) return 'lomba';
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

    function showDRMBLShimmer() {
        var container = document.getElementById('standings-content');
        container.innerHTML = buildShimmerTable(8);
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

        fetch('/api/seasons?league=drmbl')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var season = data && data.season;
                if (season && season.standings && season.standings.length > 0) {
                    renderDRMBL(season.standings);
                } else {
                    renderDRMBL([]);
                }
            })
            .catch(function () {
                var container = document.getElementById('standings-content');
                container.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">Unable to load standings.</p>';
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

    // ── LOMBA ──────────────────────────────────────────

    var lombaLeagueData = null;
    var lombaSeasonsData = null;
    var lombaFilters = { gender: 'all', division: 'all' };

    function buildLOMBAShimmerTable(rowCount) {
        var html = '<div class="standings-table-wrap">';
        html += '<table class="standings-table lomba-table">';
        html += '<thead><tr>';
        html += '<th class="col-rank">#</th>';
        html += '<th class="col-team">Team</th>';
        html += '<th class="col-pts">PTS</th>';
        html += '<th class="col-gp">GP</th>';
        html += '<th class="col-w">W</th>';
        html += '<th class="col-l">L</th>';
        html += '<th class="col-f">FF</th>';
        html += '<th class="col-pct">PCT</th>';
        html += '<th class="col-diff">+/-</th>';
        html += '</tr></thead><tbody>';
        for (var i = 0; i < rowCount; i++) {
            html += '<tr class="standings-shimmer-row">';
            html += '<td class="col-rank"><span class="shimmer-block shimmer-rank"></span></td>';
            html += '<td class="col-team"><span class="shimmer-block shimmer-team"></span></td>';
            html += '<td class="col-pts"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '<td class="col-gp"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '<td class="col-w"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '<td class="col-l"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '<td class="col-f"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '<td class="col-pct"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '<td class="col-diff"><span class="shimmer-block shimmer-stat"></span></td>';
            html += '</tr>';
        }
        html += '</tbody></table></div>';
        return html;
    }

    function showLOMBAShimmer() {
        var el = document.getElementById('standings-content');
        var genders = ['Varonil', 'Femenil'];
        var divsPerGender = [3, 2];
        var html = '';
        for (var g = 0; g < genders.length; g++) {
            html += '<div class="lomba-gender-block">';
            html += '<h2 class="division-header">' + genders[g] + '</h2>';
            for (var d = 0; d < divsPerGender[g]; d++) {
                html += '<div class="category-section">';
                html += '<h3 class="category-header"><span class="shimmer-block" style="width:140px;height:18px;display:inline-block"></span></h3>';
                html += buildLOMBAShimmerTable(8);
                html += '</div>';
            }
            html += '</div>';
        }
        el.innerHTML = html;
    }

    function computeLOMBAStandings(season) {
        var schedule = season.schedule || [];
        var teams = season.teams || [];

        var statsMap = {};
        for (var t = 0; t < teams.length; t++) {
            statsMap[teams[t].name] = { name: teams[t].name, wins: 0, losses: 0, forfeitsGiven: 0, forfeitsReceived: 0, pointDiff: 0, pts: 0 };
        }

        for (var s = 0; s < schedule.length; s++) {
            var games = schedule[s].games || [];
            for (var g = 0; g < games.length; g++) {
                var game = games[g];
                var home = game.home;
                var away = game.away;
                var homeScore = game.homeScore || 0;
                var awayScore = game.awayScore || 0;
                var isForfeit = game.forfeit === true;

                if (!statsMap[home]) statsMap[home] = { name: home, wins: 0, losses: 0, forfeitsGiven: 0, forfeitsReceived: 0, pointDiff: 0, pts: 0 };
                if (!statsMap[away]) statsMap[away] = { name: away, wins: 0, losses: 0, forfeitsGiven: 0, forfeitsReceived: 0, pointDiff: 0, pts: 0 };

                statsMap[home].pointDiff += (homeScore - awayScore);
                statsMap[away].pointDiff += (awayScore - homeScore);

                if (game.winner === 'home') {
                    statsMap[home].wins++;
                    statsMap[home].pts += 2;
                    if (isForfeit) {
                        statsMap[away].forfeitsGiven++;
                        // 0 pts for forfeit loss, not counted as regular loss
                    } else {
                        statsMap[away].losses++;
                        statsMap[away].pts += 1;
                    }
                } else if (game.winner === 'away') {
                    statsMap[away].wins++;
                    statsMap[away].pts += 2;
                    if (isForfeit) {
                        statsMap[home].forfeitsGiven++;
                        // 0 pts for forfeit loss, not counted as regular loss
                    } else {
                        statsMap[home].losses++;
                        statsMap[home].pts += 1;
                    }
                }

                // Track forfeits received (wins by forfeit)
                if (isForfeit) {
                    if (game.winner === 'home') statsMap[home].forfeitsReceived++;
                    else if (game.winner === 'away') statsMap[away].forfeitsReceived++;
                }
            }
        }

        var standings = [];
        for (var key in statsMap) {
            standings.push(statsMap[key]);
        }
        // Sort by points, then wins, then point differential
        standings.sort(function (a, b) {
            if (b.pts !== a.pts) return b.pts - a.pts;
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (a.losses !== b.losses) return a.losses - b.losses;
            return b.pointDiff - a.pointDiff;
        });

        return standings;
    }

    function buildLOMBAStandingsTable(standings, playoffCutoff) {
        var html = '<div class="standings-table-wrap">';
        html += '<table class="standings-table lomba-table">';
        html += '<thead><tr>';
        html += '<th class="col-rank">#</th>';
        html += '<th class="col-team">Team</th>';
        html += '<th class="col-pts">PTS</th>';
        html += '<th class="col-gp">GP</th>';
        html += '<th class="col-w">W</th>';
        html += '<th class="col-l">L</th>';
        html += '<th class="col-f">FF</th>';
        html += '<th class="col-pct">PCT</th>';
        html += '<th class="col-diff">+/-</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        for (var i = 0; i < standings.length; i++) {
            var team = standings[i];
            var rank = i + 1;
            var isPlayoff = playoffCutoff && rank <= playoffCutoff;

            var rowCls = '';
            if (isPlayoff) rowCls += ' playoff-team';

            var gp = team.wins + team.losses + team.forfeitsGiven;
            var pct = gp > 0 ? (team.wins / gp) : 0;
            var pctDisplay = gp > 0 ? pct.toFixed(3).replace(/^0/, '') : '--';

            var pd = team.pointDiff || 0;
            var diffDisplay = '--';
            var diffCls = 'col-diff';
            if (team.wins > 0 || team.losses > 0 || pd !== 0) {
                diffDisplay = pd > 0 ? '+' + pd : '' + pd;
                if (pd > 0) diffCls += ' positive';
                else if (pd < 0) diffCls += ' negative';
            }

            html += '<tr class="' + rowCls.trim() + '">';
            html += '<td class="col-rank">' + rank + '</td>';
            html += '<td class="col-team">' + team.name + '</td>';
            html += '<td class="col-pts">' + team.pts + '</td>';
            html += '<td class="col-gp">' + gp + '</td>';
            html += '<td class="col-w">' + team.wins + '</td>';
            html += '<td class="col-l">' + team.losses + '</td>';
            html += '<td class="col-f' + (team.forfeitsGiven > 0 ? ' ff-active' : '') + '">' + team.forfeitsGiven + '</td>';
            html += '<td class="col-pct">' + pctDisplay + '</td>';
            html += '<td class="' + diffCls + '">' + diffDisplay + '</td>';
            html += '</tr>';
        }

        html += '</tbody></table></div>';
        return html;
    }

    function getLOMBAGenders() {
        if (!lombaLeagueData || !lombaLeagueData.league || !lombaLeagueData.league.seasons) return [];
        var genders = {};
        var seasons = lombaLeagueData.league.seasons;
        for (var i = 0; i < seasons.length; i++) {
            var divs = seasons[i].data.divisions;
            for (var g in divs) {
                genders[g] = true;
            }
        }
        return Object.keys(genders);
    }

    function getLOMBADivisions(gender) {
        if (!lombaLeagueData || !lombaLeagueData.league || !lombaLeagueData.league.seasons) return [];
        var divs = [];
        var seasons = lombaLeagueData.league.seasons;
        for (var i = 0; i < seasons.length; i++) {
            var genderDivs = seasons[i].data.divisions;
            if (gender === 'all') {
                for (var g in genderDivs) {
                    for (var d = 0; d < genderDivs[g].length; d++) {
                        if (divs.indexOf(genderDivs[g][d]) === -1) divs.push(genderDivs[g][d]);
                    }
                }
            } else if (genderDivs[gender]) {
                for (var d2 = 0; d2 < genderDivs[gender].length; d2++) {
                    if (divs.indexOf(genderDivs[gender][d2]) === -1) divs.push(genderDivs[gender][d2]);
                }
            }
        }
        return divs;
    }

    function buildLOMBAFilterBar() {
        var filterWrap = document.getElementById('standings-filters');
        if (!filterWrap) return;

        var genders = getLOMBAGenders();
        var divisions = getLOMBADivisions(lombaFilters.gender);

        var html = '<div class="cb-filters">';

        // Gender filter
        html += '<select class="cb-filter-select" id="lomba-filter-gender">';
        html += '<option value="all">All Categories</option>';
        for (var g = 0; g < genders.length; g++) {
            var label = genders[g].charAt(0).toUpperCase() + genders[g].slice(1);
            var sel = lombaFilters.gender === genders[g] ? ' selected' : '';
            html += '<option value="' + genders[g] + '"' + sel + '>' + label + '</option>';
        }
        html += '</select>';

        // Division filter
        html += '<select class="cb-filter-select" id="lomba-filter-division">';
        html += '<option value="all">All Divisions</option>';
        for (var d = 0; d < divisions.length; d++) {
            var sel2 = lombaFilters.division === divisions[d] ? ' selected' : '';
            html += '<option value="' + divisions[d] + '"' + sel2 + '>' + divisions[d] + '</option>';
        }
        html += '</select>';

        // Clear button
        var hasFilter = lombaFilters.gender !== 'all' || lombaFilters.division !== 'all';
        if (hasFilter) {
            html += '<button type="button" class="cb-filter-clear" id="lomba-filter-clear">&times; Clear</button>';
        }

        html += '</div>';
        filterWrap.innerHTML = html;

        // Event listeners
        document.getElementById('lomba-filter-gender').addEventListener('change', function () {
            lombaFilters.gender = this.value;
            lombaFilters.division = 'all';
            buildLOMBAFilterBar();
            renderLOMBA();
        });
        document.getElementById('lomba-filter-division').addEventListener('change', function () {
            lombaFilters.division = this.value;
            buildLOMBAFilterBar();
            renderLOMBA();
        });
        if (hasFilter) {
            document.getElementById('lomba-filter-clear').addEventListener('click', function () {
                lombaFilters.gender = 'all';
                lombaFilters.division = 'all';
                buildLOMBAFilterBar();
                renderLOMBA();
            });
        }
    }

    function buildLOMBAPlayoffPicture(standings) {
        var cutoff = Math.min(8, standings.length);
        if (cutoff < 2) return '';

        var qualifiers = standings.slice(0, cutoff);

        // QF matchups: #1v#8, #4v#5, #2v#7, #3v#6
        // Arranged so winners of top half meet in SF, bottom half meet in SF
        var qfTop = [
            { seed1: 1, seed2: 8 },
            { seed1: 4, seed2: 5 }
        ];
        var qfBot = [
            { seed1: 2, seed2: 7 },
            { seed1: 3, seed2: 6 }
        ];

        function teamName(seed) {
            return qualifiers[seed - 1] ? qualifiers[seed - 1].name : 'TBD';
        }

        function buildSlot(seed, name, pos, side, score) {
            var scoreHtml = '<span class="lbk-score">' + (score !== undefined && score !== null ? score : '') + '</span>';
            if (side === 'right') {
                return '<div class="lbk-slot ' + pos + '">' +
                    scoreHtml +
                    '<span class="lbk-name">' + name + '</span>' +
                    '<span class="lbk-seed">#' + seed + '</span>' +
                    '</div>';
            }
            return '<div class="lbk-slot ' + pos + '">' +
                '<span class="lbk-seed">#' + seed + '</span>' +
                '<span class="lbk-name">' + name + '</span>' +
                scoreHtml +
                '</div>';
        }

        function buildMatchup(m, cls, side) {
            return '<div class="lbk-matchup ' + (cls || '') + '">' +
                buildSlot(m.seed1, teamName(m.seed1), 'top', side) +
                buildSlot(m.seed2, teamName(m.seed2), 'bot', side) +
                '</div>';
        }

        function buildTBDMatchup(cls, side) {
            var slot1, slot2;
            if (side === 'right') {
                slot1 = '<div class="lbk-slot top"><span class="lbk-score"></span><span class="lbk-name lbk-tbd">TBD</span></div>';
                slot2 = '<div class="lbk-slot bot"><span class="lbk-score"></span><span class="lbk-name lbk-tbd">TBD</span></div>';
            } else {
                slot1 = '<div class="lbk-slot top"><span class="lbk-name lbk-tbd">TBD</span><span class="lbk-score"></span></div>';
                slot2 = '<div class="lbk-slot bot"><span class="lbk-name lbk-tbd">TBD</span><span class="lbk-score"></span></div>';
            }
            return '<div class="lbk-matchup ' + (cls || '') + '">' + slot1 + slot2 + '</div>';
        }

        var html = '<div class="lomba-playoff-picture">';
        html += '<h4 class="lbk-title">Playoff Picture</h4>';

        html += '<div class="lbk-bracket">';

        // ── Left side (QF top → SF top) ──
        html += '<div class="lbk-side lbk-left">';

        // QF round
        html += '<div class="lbk-round lbk-qf">';
        html += '<div class="lbk-round-label">Quarter-Finals</div>';
        for (var i = 0; i < qfTop.length; i++) {
            html += buildMatchup(qfTop[i], '', 'left');
        }
        html += '</div>';

        // Connector
        html += '<div class="lbk-connector lbk-conn-2"></div>';

        // SF round
        html += '<div class="lbk-round lbk-sf">';
        html += '<div class="lbk-round-label">Semi-Final</div>';
        html += buildTBDMatchup('', 'left');
        html += '</div>';

        html += '</div>'; // end left side

        // ── Championship ──
        html += '<div class="lbk-center">';
        html += '<div class="lbk-connector-h"></div>';
        html += '<div class="lbk-round lbk-final">';
        html += '<div class="lbk-round-label">Championship</div>';
        html += buildTBDMatchup('lbk-champ');
        html += '</div>';
        html += '<div class="lbk-connector-h"></div>';
        html += '</div>';

        // ── Right side: SF (next to champ) → connector → QF (outside) ──
        html += '<div class="lbk-side lbk-right">';

        html += '<div class="lbk-round lbk-sf">';
        html += '<div class="lbk-round-label">Semi-Final</div>';
        html += buildTBDMatchup('', 'right');
        html += '</div>';

        html += '<div class="lbk-connector lbk-conn-2"></div>';

        html += '<div class="lbk-round lbk-qf">';
        html += '<div class="lbk-round-label">Quarter-Finals</div>';
        for (var j = 0; j < qfBot.length; j++) {
            html += buildMatchup(qfBot[j], '', 'right');
        }
        html += '</div>';

        html += '</div>'; // end right side

        html += '</div>'; // end bracket
        html += '</div>'; // end playoff picture
        return html;
    }

    function renderLOMBA() {
        var el = document.getElementById('standings-content');
        var html = '';

        var leagueSeasons = (lombaLeagueData && lombaLeagueData.league && lombaLeagueData.league.seasons) || [];

        for (var ls = 0; ls < leagueSeasons.length; ls++) {
            var seasonName = leagueSeasons[ls].name;
            var divisions = leagueSeasons[ls].data.divisions;

            var genders = Object.keys(divisions);
            var hasContent = false;

            var seasonHtml = '';

            for (var gi = 0; gi < genders.length; gi++) {
                var gender = genders[gi];

                // Filter by gender
                if (lombaFilters.gender !== 'all' && lombaFilters.gender !== gender) continue;

                var genderLabel = gender.charAt(0).toUpperCase() + gender.slice(1);
                var divList = divisions[gender];

                var genderHtml = '';
                var genderHasContent = false;

                for (var di = 0; di < divList.length; di++) {
                    var divName = divList[di];

                    // Filter by division
                    if (lombaFilters.division !== 'all' && lombaFilters.division !== divName) continue;

                    var genderKey = 'league.seasons.data.divisions.' + gender;

                    // Find matching season
                    var matchSeason = null;
                    for (var si = 0; si < lombaSeasonsData.length; si++) {
                        var s = lombaSeasonsData[si];
                        if (s.league && s.league.season &&
                            s.league.season['league.seasons.name'] === seasonName &&
                            s.league.season[genderKey] === divName) {
                            matchSeason = s;
                            break;
                        }
                    }

                    genderHtml += '<div class="category-section">';
                    genderHtml += '<h3 class="category-header">' + divName + '</h3>';

                    if (matchSeason && matchSeason.teams && matchSeason.teams.length > 0) {
                        var standings = computeLOMBAStandings(matchSeason);
                        var playoffCut = Math.min(8, standings.length);
                        genderHtml += buildLOMBAStandingsTable(standings, playoffCut);
                        genderHtml += buildLOMBAPlayoffPicture(standings);
                    } else {
                        genderHtml += '<p class="empty-standings">No teams registered yet.</p>';
                    }

                    genderHtml += '</div>';
                    genderHasContent = true;
                }

                if (genderHasContent) {
                    seasonHtml += '<div class="lomba-gender-block">';
                    seasonHtml += '<h2 class="division-header">' + genderLabel + '</h2>';
                    seasonHtml += genderHtml;
                    seasonHtml += '</div>';
                    hasContent = true;
                }
            }

            if (hasContent) {
                html += seasonHtml;
            }
        }

        if (!html) {
            html = '<p class="empty-standings">No standings match the selected filters.</p>';
        }

        el.innerHTML = html;
    }

    function loadLOMBA() {
        showLOMBAShimmer();

        fetch('/api/lomba?action=league')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                lombaLeagueData = data;
                return fetch('/api/lomba?action=seasons');
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                lombaSeasonsData = data;
                buildLOMBAFilterBar();
                renderLOMBA();
            })
            .catch(function (err) {
                console.error('LOMBA standings error:', err);
                var el = document.getElementById('standings-content');
                el.innerHTML = '<p class="empty-standings">Unable to load standings. Please try again later.</p>';
            });
    }

    // ── Init ──

    function init() {
        initLeagueSwitcher();

        if (CURRENT_LEAGUE === 'copa-beta') {
            loadCopaBeta();
        } else if (CURRENT_LEAGUE === 'lomba') {
            loadLOMBA();
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
