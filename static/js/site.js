(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hdr = document.querySelector('.hdr');
  function onScroll() { if (hdr) hdr.classList.toggle('scrolled', window.scrollY > 10); }
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  // Scroll reveal
  var els = document.querySelectorAll('.card, .sec h2, .sec .lead, .step, .stat, .pub, .reveal, .grid > *');
  els.forEach(function (el, i) { el.classList.add('rv'); el.style.setProperty('--d', (i % 6) * 70 + 'ms'); });
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  } else { els.forEach(function (el) { el.classList.add('in'); }); }

  // Counters
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var target = +el.dataset.count;
    if (reduce || !('IntersectionObserver' in window)) { el.textContent = target; return; }
    var o = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; o.disconnect();
      var t0 = performance.now();
      (function tick(t) {
        var k = Math.min((t - t0) / 1200, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    }); o.observe(el);
  });

  // Hero network animation
  var c = document.getElementById('net');
  if (c && !reduce) {
    var ctx = c.getContext('2d'), W, H, pts = [], N;
    function size() {
      var r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      W = r.width; H = r.height; c.width = W * d; c.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      N = Math.max(28, Math.min(70, Math.floor(W * H / 14000)));
      pts = []; for (var i = 0; i < N; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35 });
    }
    var mouse = { x: -999, y: -999 };
    c.parentNode.addEventListener('mousemove', function (e) { var r = c.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < N; i++) {
        var p = pts[i]; p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1;
        for (var j = i + 1; j < N; j++) {
          var q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) { ctx.strokeStyle = 'rgba(120,220,235,' + (0.28 * (1 - d / 130)) + ')'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        }
        var md = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        if (md < 160) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - md / 160)) + ')'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
        ctx.fillStyle = 'rgba(160,235,245,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 6.3); ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    size(); frame(); window.addEventListener('resize', size);
  }
})();

// Copy citation buttons
document.addEventListener('click', function (e) {
  var b = e.target.closest('.cite-btn'); if (!b) return;
  var text = b.getAttribute('data-copy'), old = b.textContent;
  function done() { b.textContent = '✓'; setTimeout(function () { b.textContent = old; }, 1400); }
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done); else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
});
setTimeout(function () { document.querySelectorAll('.toast').forEach(function (t) { t.remove(); }); }, 7000);
