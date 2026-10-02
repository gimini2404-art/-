(function () {
  var KEY = 'sx_consent', cfg = {};
  try { cfg = JSON.parse(document.getElementById('analytics-config').textContent); } catch (e) {}
  var banner = document.getElementById('cookie-banner');
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function load(src, attrs) { var s = document.createElement('script'); s.src = src; s.async = true; Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); }); document.head.appendChild(s); }
  var gaLoaded = false;
  function enableAnalytics() {
    if (gaLoaded) return; gaLoaded = true;
    if (cfg.ga) {
      window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); };
      gtag('js', new Date()); gtag('config', cfg.ga, { anonymize_ip: true });
      load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga));
    }
    document.querySelectorAll('script[type="text/plain"][data-consent="analytics"]').forEach(function (n) {
      var s = document.createElement('script'); s.text = n.textContent; document.head.appendChild(s);
    });
  }
  // Plausible is cookie-free, so it needs no consent.
  if (cfg.plausible) load('https://plausible.io/js/script.js', { 'data-domain': cfg.plausible, defer: '' });
  var state = get();
  if (state === 'granted') enableAnalytics();
  else if (state === null && banner && (cfg.ga || document.querySelector('script[data-consent="analytics"]'))) banner.hidden = false;
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-consent]'); if (b && b.closest('#cookie-banner')) {
      set(b.getAttribute('data-consent')); banner.hidden = true; if (b.getAttribute('data-consent') === 'granted') enableAnalytics();
    }
    if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); if (banner) banner.hidden = false; }
  });
})();
