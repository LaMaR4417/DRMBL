(function () {
    var teamCacheByLeague = {};

    // Tab switching
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.admin-tab').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            document.querySelectorAll('.admin-panel').forEach(function (p) { p.classList.remove('active'); });
            document.getElementById('panel-' + tab).classList.add('active');
        });
    });

    // ── Load leagues into both selects ──
    function loadLeagues() {
        return fetch('/api/admin?action=leagues')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var leagues = data.leagues || [];
                ['add-league', 'edit-league'].forEach(function (id) {
                    var sel = document.getElementById(id);
                    sel.innerHTML = '<option value="">Select a league...</option>';
                    leagues.forEach(function (lg) {
                        var opt = document.createElement('option');
                        opt.value = lg.id;
                        opt.textContent = lg.id;
                        sel.appendChild(opt);
                    });
                });
            });
    }

    function loadTeams(leagueID, targetSelectID) {
        var sel = document.getElementById(targetSelectID);
        sel.innerHTML = '<option value="">Loading...</option>';
        sel.disabled = true;

        var promise = teamCacheByLeague[leagueID]
            ? Promise.resolve(teamCacheByLeague[leagueID])
            : fetch('/api/admin?action=teams&league=' + encodeURIComponent(leagueID))
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var teams = (data.teams || []).sort(function (a, b) {
                        return (a.name || '').localeCompare(b.name || '');
                    });
                    teamCacheByLeague[leagueID] = teams;
                    return teams;
                });

        return promise.then(function (teams) {
            sel.innerHTML = '<option value="">Select a team...</option>';
            teams.forEach(function (t) {
                var opt = document.createElement('option');
                opt.value = t.teamID;
                opt.textContent = t.name;
                sel.appendChild(opt);
            });
            sel.disabled = false;
        });
    }

    // ── ADD TAB ──
    document.getElementById('add-league').addEventListener('change', function () {
        var league = this.value;
        document.getElementById('add-team').innerHTML = '<option value="">Select a team...</option>';
        document.getElementById('add-team').disabled = true;
        document.getElementById('add-submit').disabled = true;
        if (league) loadTeams(league, 'add-team');
    });

    document.getElementById('add-team').addEventListener('change', updateAddSubmit);
    document.getElementById('add-name').addEventListener('input', updateAddSubmit);

    function updateAddSubmit() {
        var hasTeam = !!document.getElementById('add-team').value;
        var hasName = document.getElementById('add-name').value.trim().length > 0;
        document.getElementById('add-submit').disabled = !(hasTeam && hasName);
    }

    document.getElementById('add-submit').addEventListener('click', function () {
        var teamID = document.getElementById('add-team').value;
        var name = document.getElementById('add-name').value.trim();
        var status = document.getElementById('add-status');
        var btn = this;

        btn.disabled = true;
        status.className = 'admin-status';
        status.textContent = '';

        fetch('/api/admin?action=add-player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamID: teamID, name: name })
        })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error(res.body.error || 'Failed');
                status.className = 'admin-status success';
                status.textContent = 'Added: ' + res.body.player.name + ' (' + res.body.player.id + ')';
                document.getElementById('add-name').value = '';
                btn.disabled = true;
            })
            .catch(function (e) {
                status.className = 'admin-status error';
                status.textContent = 'Error: ' + e.message;
                btn.disabled = false;
            });
    });

    // ── EDIT TAB ──
    document.getElementById('edit-league').addEventListener('change', function () {
        var league = this.value;
        document.getElementById('edit-team').innerHTML = '<option value="">Select a team...</option>';
        document.getElementById('edit-team').disabled = true;
        document.getElementById('roster-list').innerHTML = '';
        hideEditForm();
        if (league) loadTeams(league, 'edit-team');
    });

    document.getElementById('edit-team').addEventListener('change', function () {
        var teamID = this.value;
        if (!teamID) {
            document.getElementById('roster-list').innerHTML = '';
            hideEditForm();
            return;
        }
        loadRoster(teamID);
    });

    function loadRoster(teamID) {
        var list = document.getElementById('roster-list');
        list.innerHTML = '<div class="loading">Loading roster...</div>';
        hideEditForm();

        fetch('/api/admin?action=team&id=' + encodeURIComponent(teamID))
            .then(function (r) { return r.json(); })
            .then(function (team) {
                var roster = (team.seasons && team.seasons[0] && team.seasons[0].roster) || [];
                if (roster.length === 0) {
                    list.innerHTML = '<div class="loading">No players on this roster.</div>';
                    return;
                }
                list.innerHTML = '';
                roster.forEach(function (p) {
                    if (!p.playerID) return;
                    var row = document.createElement('div');
                    row.className = 'roster-row';
                    row.innerHTML = '<span class="player-name">' + p.name + '</span><span class="player-id">' + p.playerID + '</span>';
                    row.addEventListener('click', function () { loadPlayer(p.playerID); });
                    list.appendChild(row);
                });
            })
            .catch(function (e) {
                list.innerHTML = '<div class="admin-status error">Error: ' + e.message + '</div>';
            });
    }

    function loadPlayer(playerID) {
        var currentTeamID = document.getElementById('edit-team').value;
        fetch('/api/admin?action=player&id=' + encodeURIComponent(playerID))
            .then(function (r) { return r.json(); })
            .then(function (player) {
                document.getElementById('edit-player-id').value = player.id;
                document.getElementById('edit-name').value = player.name || '';
                document.getElementById('edit-unique-number').value = player.uniqueNumber != null ? player.uniqueNumber : '';

                // Find jerseyNumbers for current team (array)
                var currentJerseys = [];
                var teams = player.teams || [];
                for (var i = 0; i < teams.length; i++) {
                    if (teams[i].teamID === currentTeamID) {
                        currentJerseys = teams[i].jerseyNumbers || [];
                        break;
                    }
                }
                document.getElementById('edit-number').value = currentJerseys.join(', ');

                var bio = player.bio || {};
                var pos = bio.position || {};
                var ht = bio.height || {};
                var wt = bio.weight || {};
                var dob = bio.dob || {};

                document.getElementById('edit-position').value = pos.primary || '';

                // Secondary positions (checkboxes)
                var secondary = pos.secondary || [];
                var secChecks = document.querySelectorAll('#edit-position-secondary input[type="checkbox"]');
                for (var o = 0; o < secChecks.length; o++) {
                    secChecks[o].checked = secondary.indexOf(secChecks[o].value) !== -1;
                }

                document.getElementById('edit-height-ft').value = ht.feet != null ? ht.feet : '';
                document.getElementById('edit-height-in').value = ht.inches != null ? ht.inches : '';
                document.getElementById('edit-weight').value = wt.lbs != null ? wt.lbs : '';
                document.getElementById('edit-dob').value = dob.iso || '';

                document.getElementById('edit-form').classList.add('visible');
                document.getElementById('edit-status').className = 'admin-status';
                document.getElementById('edit-status').textContent = '';
            });
    }

    function hideEditForm() {
        document.getElementById('edit-form').classList.remove('visible');
    }

    document.getElementById('edit-cancel').addEventListener('click', hideEditForm);

    document.getElementById('edit-save').addEventListener('click', function () {
        var btn = this;
        var status = document.getElementById('edit-status');
        var id = document.getElementById('edit-player-id').value;
        var name = document.getElementById('edit-name').value.trim();
        var numberVal = document.getElementById('edit-number').value;
        var posVal = document.getElementById('edit-position').value;
        var ftVal = document.getElementById('edit-height-ft').value;
        var inVal = document.getElementById('edit-height-in').value;
        var wtVal = document.getElementById('edit-weight').value;
        var dobVal = document.getElementById('edit-dob').value;

        var totalInches = (parseInt(ftVal) || 0) * 12 + (parseInt(inVal) || 0);
        var cm = totalInches > 0 ? Math.round(totalInches * 2.54) : null;
        var lbs = wtVal !== '' ? parseInt(wtVal) : null;
        var kg = lbs != null ? Math.round(lbs * 0.453592) : null;

        var dobObj = { date: null, month: null, year: null, iso: null };
        if (dobVal) {
            var parts = dobVal.split('-');
            dobObj = {
                year: parseInt(parts[0]),
                month: parseInt(parts[1]),
                date: parseInt(parts[2]),
                iso: dobVal
            };
        }

        var secChecks2 = document.querySelectorAll('#edit-position-secondary input[type="checkbox"]');
        var secondaryPositions = [];
        for (var so = 0; so < secChecks2.length; so++) {
            if (secChecks2[so].checked) secondaryPositions.push(secChecks2[so].value);
        }

        var teamIDForNumber = document.getElementById('edit-team').value;
        var uniqueNumberVal = document.getElementById('edit-unique-number').value;

        // Parse comma-separated jersey numbers
        var jerseyNumbers = [];
        if (numberVal.trim() !== '') {
            var parts = numberVal.split(',');
            for (var jn = 0; jn < parts.length; jn++) {
                var n = parseInt(parts[jn].trim());
                if (!isNaN(n)) jerseyNumbers.push(n);
            }
        }

        var payload = {
            id: id,
            name: name,
            uniqueNumber: uniqueNumberVal !== '' ? parseInt(uniqueNumberVal) : null,
            teamID: teamIDForNumber,
            jerseyNumbers: jerseyNumbers,
            bio: {
                position: { primary: posVal, secondary: secondaryPositions },
                weight: { lbs: lbs, kg: kg },
                height: {
                    feet: ftVal !== '' ? parseInt(ftVal) : null,
                    inches: inVal !== '' ? parseInt(inVal) : null,
                    cm: cm
                },
                dob: dobObj
            }
        };

        btn.disabled = true;
        fetch('/api/admin?action=update-player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error(res.body.error || 'Failed');
                status.className = 'admin-status success';
                status.textContent = 'Saved.';
                // Refresh roster (in case name changed)
                var teamID = document.getElementById('edit-team').value;
                if (teamID) loadRoster(teamID);
            })
            .catch(function (e) {
                status.className = 'admin-status error';
                status.textContent = 'Error: ' + e.message;
            })
            .finally(function () { btn.disabled = false; });
    });

    document.getElementById('edit-delete').addEventListener('click', function () {
        var id = document.getElementById('edit-player-id').value;
        if (!id) return;
        if (!confirm('Delete ' + id + '? This will also remove them from the team roster.')) return;

        var status = document.getElementById('edit-status');
        var btn = this;
        btn.disabled = true;

        fetch('/api/admin?action=delete-player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error(res.body.error || 'Failed');
                hideEditForm();
                var teamID = document.getElementById('edit-team').value;
                if (teamID) loadRoster(teamID);
            })
            .catch(function (e) {
                status.className = 'admin-status error';
                status.textContent = 'Error: ' + e.message;
            })
            .finally(function () { btn.disabled = false; });
    });

    // Init
    loadLeagues();
})();
