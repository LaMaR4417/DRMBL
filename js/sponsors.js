/* ── SPONSOR DATA ──────────────────────────────────────────
   Shared config used by the carousel on every page.

   SPONSOR_GOAL  = total sponsorship target ($1000)
   SPONSOR_EACH  = dollar value one slot represents ($50)
   -> 1000 / 50 = 20 slots per carousel set

   Add sponsors here:
   {
       id:     'example-biz',
       name:   'Example Biz',
       img:    'sponsors/example.png',
       amount: 200,
       bio:    'Short description...',
       links: [
           { label: 'Website',   url: 'https://example.com' },
           { label: 'Facebook',  url: 'https://facebook.com/example' },
           { label: 'Instagram', url: 'https://instagram.com/example' },
       ]
   }
──────────────────────────────────────────────────────────── */
var SPONSOR_GOAL = 3000;
var SPONSOR_EACH = 50;
var SPONSORS = [
    // { id: 'example-biz', name: 'Example Biz', img: 'sponsors/example.png', amount: 200, bio: 'A great local business.', links: [{ label: 'Website', url: 'https://example.com' }] },
];

document.addEventListener('DOMContentLoaded', function() {
    // Inject carousel HTML after the header
    var section = document.createElement('section');
    section.className = 'sponsors-section';
    section.innerHTML =
        '<div class="sponsors-track-wrapper">' +
            '<div class="sponsors-track"></div>' +
        '</div>';

    var header = document.querySelector('.site-header');
    if (header && header.nextSibling) {
        header.parentNode.insertBefore(section, header.nextSibling);
    } else {
        document.body.insertBefore(section, document.body.firstChild);
    }

    var track = section.querySelector('.sponsors-track');
    var totalSlots = Math.round(SPONSOR_GOAL / SPONSOR_EACH);
    var pool = [];

    // Build weighted sponsor slots
    var filled = 0;
    SPONSORS.forEach(function (sp) {
        var count = Math.max(1, Math.round(sp.amount / SPONSOR_EACH));
        filled += count;
        for (var i = 0; i < count; i++) pool.push(sp);
    });

    // Fill remaining with empty placeholders
    for (var i = filled; i < totalSlots; i++) pool.push(null);

    // Shuffle for even distribution
    for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }

    // Render slots
    pool.forEach(function (sp) {
        var div = document.createElement('div');
        div.className = 'sponsor-slot';
        if (sp) {
            var a = document.createElement('a');
            a.href = 'sponsor-bio.html?id=' + encodeURIComponent(sp.id);
            a.className = 'sponsor-slot-link';
            if (sp.img) {
                var img = document.createElement('img');
                img.src = sp.img;
                img.alt = sp.name;
                a.appendChild(img);
            } else {
                a.textContent = sp.name;
            }
            div.appendChild(a);
        } else {
            var ad = document.createElement('a');
            ad.href = 'sponsor.html';
            ad.className = 'sponsor-slot-link';
            ad.textContent = 'YOUR AD HERE';
            div.appendChild(ad);
        }
        track.appendChild(div);
    });

    // Clone for endless scroll
    var originals = Array.from(track.children);
    if (!originals.length) return;
    var slotW = originals[0].offsetWidth + 30;
    var setW  = originals.length * slotW;
    var copies = Math.ceil(window.innerWidth / setW) + 1;
    for (var c = 1; c < copies; c++)
        originals.forEach(function (s) { track.appendChild(s.cloneNode(true)); });
    Array.from(track.children).forEach(function (s) {
        track.appendChild(s.cloneNode(true));
    });
    track.style.animationDuration = (track.scrollWidth / 2 / 50) + 's';
});
