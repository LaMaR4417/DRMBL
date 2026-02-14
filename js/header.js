document.addEventListener('DOMContentLoaded', function() {
    var header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML =
        '<nav class="nav-inner">' +
            '<a href="index.html" class="nav-link nav-primary">Home</a>' +
            '<a href="index.html#info" class="nav-link nav-secondary">Join the League</a>' +
            '<a href="sponsor.html#current-sponsors" class="nav-link nav-secondary">Our Sponsors</a>' +
            '<a href="schedule.html" class="nav-link nav-secondary">Schedule</a>' +
            '<a href="live-game.html" class="nav-link nav-secondary">Live Game</a>' +
            '<a href="standings.html" class="nav-link nav-secondary">Standings</a>' +
            '<a href="stats.html" class="nav-link nav-secondary">Stats</a>' +
            '<a href="owner.html" class="nav-link nav-secondary">Owner</a>' +
            '<a href="rules.html" class="nav-link nav-secondary">Rules</a>' +
            '<a href="sponsor.html" class="nav-link nav-secondary">Sponsor Us</a>' +
            '<button type="button" class="menu-toggle" aria-label="Menu">' +
                '<span></span><span></span><span></span>' +
            '</button>' +
        '</nav>' +
        '<div class="mobile-menu">' +
            '<a href="index.html" class="nav-link">Home</a>' +
            '<a href="index.html#info" class="nav-link">Join the League</a>' +
            '<a href="sponsor.html#current-sponsors" class="nav-link">Our Sponsors</a>' +
            '<a href="schedule.html" class="nav-link">Schedule</a>' +
            '<a href="live-game.html" class="nav-link">Live Game</a>' +
            '<a href="standings.html" class="nav-link">Standings</a>' +
            '<a href="stats.html" class="nav-link">Stats</a>' +
            '<a href="owner.html" class="nav-link">Owner</a>' +
            '<a href="rules.html" class="nav-link">Rules</a>' +
            '<a href="sponsor.html" class="nav-link">Sponsor Us</a>' +
        '</div>';

    document.body.insertBefore(header, document.body.firstChild);

    var toggle = header.querySelector('.menu-toggle');
    var menu = header.querySelector('.mobile-menu');
    toggle.addEventListener('click', function() {
        toggle.classList.toggle('open');
        menu.classList.toggle('open');
    });
});
