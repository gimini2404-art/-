(function () {
  var el = document.getElementById('collab-map'), data = document.getElementById('map-points');
  if (!el || !data || typeof L === 'undefined') return;
  var pts = JSON.parse(data.textContent);
  var map = L.map(el, { scrollWheelZoom: false, worldCopyJump: true }).setView([25, 20], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  var bounds = [];
  pts.forEach(function (p) {
    var icon = L.divIcon({ className: 'pin-wrap', html: '<span class="pin"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
    var html = '<strong>' + esc(p.name) + '</strong><br>' + esc(p.country) + '<br><em>' + esc(p.type) + '</em>' +
      (p.link ? '<br><a href="' + encodeURI(p.link) + '" target="_blank" rel="noopener">' + esc(p.link.replace(/^https?:\/\//, '')) + '</a>' : '');
    L.marker([p.lat, p.lng], { icon: icon }).addTo(map).bindPopup(html);
    bounds.push([p.lat, p.lng]);
  });
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
  else if (bounds.length === 1) map.setView(bounds[0], 5);
  el.addEventListener('click', function () { map.scrollWheelZoom.enable(); });
})();
