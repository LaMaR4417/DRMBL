(function () {
    function buildTable(data) {
        var container = document.getElementById('standings-content');
        var banner = document.getElementById('standings-banner');
        var standings = data.standings;
        var seasonStarted = data.seasonStarted;

        // Show/hide pre-season banner
        if (banner) {
            if (seasonStarted) {
                banner.classList.add('hidden');
            } else {
                banner.classList.remove('hidden');
            }
        }

        if (!standings || standings.length === 0) {
            container.innerHTML = '<div class="standings-empty">No teams registered yet.</div>';
            return;
        }

        var html = '';
        html += '<div class="standings-table-wrap">';
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
            var isPlayoff = team.rank !== null && team.rank <= 4;

            var rowCls = '';
            if (isTBD) rowCls += ' tbd-team';
            if (isPlayoff) rowCls += ' playoff-team';

            var rankDisplay = team.rank !== null ? team.rank : '--';
            var winsDisplay = team.wins || 0;
            var lossesDisplay = team.losses || 0;

            var diffDisplay = '--';
            var diffCls = 'col-diff';
            if (team.pointDifferential !== null && (seasonStarted || team.pointDifferential !== 0)) {
                var pd = team.pointDifferential;
                diffDisplay = pd > 0 ? '+' + pd : '' + pd;
                if (pd > 0) diffCls += ' positive';
                else if (pd < 0) diffCls += ' negative';
            }

            html += '<tr class="' + rowCls.trim() + '">';
            html += '<td class="col-rank">' + rankDisplay + '</td>';
            html += '<td class="col-team">' + team.name + '</td>';
            html += '<td class="col-w">' + winsDisplay + '</td>';
            html += '<td class="col-l">' + lossesDisplay + '</td>';
            html += '<td class="' + diffCls + '">' + diffDisplay + '</td>';
            html += '</tr>';
        }

        html += '</tbody>';
        html += '</table>';
        html += '</div>';

        container.innerHTML = html;
    }

    function loadStandings() {
        fetch('/api/standings')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.standings) {
                    buildTable(data);
                } else if (data && data.error) {
                    document.getElementById('standings-content').innerHTML =
                        '<div class="standings-empty">Unable to load standings.</div>';
                }
            })
            .catch(function () {
                document.getElementById('standings-content').innerHTML =
                    '<div class="standings-empty">Unable to load standings.</div>';
            });
    }

    function init() {
        loadStandings();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
