document.addEventListener('DOMContentLoaded', function() {
    var header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML =
        '<nav class="nav-inner">' +
            '<a href="DRMBL.html" class="nav-link nav-primary">Join the League</a>' +
            '<a href="live-game.html" class="nav-link nav-secondary">Live Game</a>' +
            '<a href="standings.html" class="nav-link nav-secondary">Standings</a>' +
            '<a href="stats.html" class="nav-link nav-secondary">Stats</a>' +
            '<a href="owner.html" class="nav-link nav-secondary">Owner</a>' +
            '<button type="button" class="menu-toggle" aria-label="Menu">' +
                '<span></span><span></span><span></span>' +
            '</button>' +
        '</nav>' +
        '<div class="mobile-menu">' +
            '<a href="live-game.html" class="nav-link">Live Game</a>' +
            '<a href="standings.html" class="nav-link">Standings</a>' +
            '<a href="stats.html" class="nav-link">Stats</a>' +
            '<a href="owner.html" class="nav-link">Owner</a>' +
        '</div>';

    document.body.insertBefore(header, document.body.firstChild);

    var toggle = header.querySelector('.menu-toggle');
    var menu = header.querySelector('.mobile-menu');
    toggle.addEventListener('click', function() {
        toggle.classList.toggle('open');
        menu.classList.toggle('open');
    });
});
