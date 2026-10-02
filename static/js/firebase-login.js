/* "Continue with Google": Firebase sign-in in the browser, then the server verifies the ID token and starts the session. */
(function () {
  var btn = document.getElementById('google-signin');
  var cfgEl = document.getElementById('firebase-config');
  if (!btn || !cfgEl || !window.firebase) return;
  var msg = document.getElementById('google-msg');
  var csrf = (document.querySelector('input[name=csrfmiddlewaretoken]') || {}).value || '';
  firebase.initializeApp(JSON.parse(cfgEl.textContent));
  btn.addEventListener('click', function () {
    btn.disabled = true; msg.textContent = '';
    var provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).then(function (res) {
      return res.user.getIdToken();
    }).then(function (token) {
      return fetch(btn.dataset.url, {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'X-CSRFToken': csrf},
        body: JSON.stringify({idToken: token, next: btn.dataset.next || ''})
      });
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { window.location = data.redirect; return; }
      throw new Error(data.error || btn.dataset.error);
    }).catch(function (e) {
      btn.disabled = false;
      if (e && e.code === 'auth/popup-closed-by-user') return;
      msg.textContent = (e && e.message && e.message.indexOf('Firebase') === -1) ? e.message : btn.dataset.error;
      firebase.auth().signOut().catch(function () {});
    });
  });
})();
