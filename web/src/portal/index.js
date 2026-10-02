import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updatePassword } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { reloadUser, resendVerification, signIn, signInGoogle, signOut, signUp, state } from '../auth.js';
import { getItem, list, norm } from '../data/content.js';
import { MAX_STUDENT_BYTES, deletePrivateFile, saveBlob, uploadPrivateFile } from '../data/files.js';
import { field, formValues, honeypot, showErrors, spamCheck, validate, busy } from '../ui/forms.js';
import { getLang, setLang, t, tr, url, fmtDate } from '../i18n/index.js';
import { CHOICES, choiceLabel } from '../schema.js';
import { toast } from '../ui/toast.js';
import { html, raw, linebreaks, isEmail } from '../util.js';
import { getMine, markAllRead, myEnrollments, myNotifications, myRequests, notify, ensureProfile, getProfile, updateProfile } from './store.js';

const authBox = (title, body) => html`<section class="pagehead pagehead-sm"><div class="wrap"><h1>${t('Student portal')}</h1></div></section><section class="sec"><div class="wrap narrow auth"><h2>${title}</h2>${body}</div></section>`;

function shell(section, title, body) {
  const u = state.user;
  const initial = ([...(u.displayName || u.email)][0] || '').toUpperCase();
  const nav = (k, href, label, extra = '') => html`<a href="${url(href)}" class="${section === k ? 'on' : ''}">${label}${extra}</a>`;
  return html`<section class="pagehead pagehead-sm"><div class="wrap"><h1>${title}</h1></div></section>
<section class="sec"><div class="wrap portal"><aside class="portal-nav" aria-label="${t('Account menu')}">
  <p class="who"><span class="avatar-sm">${initial}</span><span><strong>${u.displayName || u.email}</strong><small dir="ltr">${u.email}</small></span></p>
  ${nav('dashboard', '/account/', t('Dashboard'))}${nav('courses', '/account/courses/', t('My courses'))}${nav('projects', '/account/projects/', t('My projects'))}
  ${nav('notifications', '/account/notifications/', t('Notifications'), state.unread ? html` <span class="badge">${state.unread}</span>` : '')}${nav('profile', '/account/profile/', t('Profile & password'))}
  <a href="${url('/training/')}">${t('Browse training')}</a><button type="button" class="linkbtn" id="signout">${t('Sign out')}</button></aside>
<div class="portal-main">${body}</div></div></section>`;
}

const ERR = {
  'auth/invalid-credential': 'Incorrect email or password.', 'auth/wrong-password': 'Incorrect email or password.', 'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'Enter a valid email address.', 'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
  'auth/weak-password': 'This password is too short or too common.', 'auth/too-many-requests': 'Too many requests. Please try again later.',
};
const authMsg = (e) => t(ERR[e?.code] || 'Something went wrong');

function safeNext(q, fallback) {
  const n = q.get('next') || '';
  return n.startsWith('/') && !n.startsWith('//') ? n : fallback;
}

export default async function portal(ctx) {
  const rest = (ctx.params.rest || '').replace(/\/+$/, '');
  const [a, b] = rest.split('/');
  const lang = ctx.lang;
  const goto = (p) => ({ redirect: url(p) });
  const common = { noindex: true, title: t('My account') };

  // ---- pages that need no session ---------------------------------------------------------------
  if (a === 'login') return state.user && state.user.emailVerified ? goto('/account/') : loginPage(ctx, common);
  if (a === 'signup') return state.user && state.user.emailVerified ? goto('/account/') : signupPage(ctx, common);
  if (a === 'password-reset') return resetPage(ctx, common);
  if (!state.user) return { redirect: url('/account/login/') + '?next=' + encodeURIComponent(location.pathname) };
  if (a === 'confirm-email' || !state.user.emailVerified) return a === 'confirm-email' ? confirmPage(ctx, common) : goto('/account/confirm-email/');

  // ---- signed-in, verified student ------------------------------------------------------------------
  const profile = await ensureProfile();
  const finish = (view) => ({ ...common, ...view, html: shell(view.section, view.heading || view.title, view.html), after: (root, c) => { root.querySelector('#signout')?.addEventListener('click', async () => { await signOut(); ctx.navigate(url('/')); }); view.after?.(root, c); } });
  if (a === undefined || a === '') return finish(await dashboard(ctx, profile));
  if (a === 'courses') return b ? finish(await coursePage(ctx, b)) : finish(await courses());
  if (a === 'projects') return b === 'new' ? finish(await projectForm(ctx, null)) : b ? finish(await projectPage(ctx, b)) : finish(await projects());
  if (a === 'profile') return finish(await profilePage(ctx, profile));
  if (a === 'notifications') return finish(await notificationsPage());
  return null;
}

// ----------------------------------------------------------------------------------------------- auth pages
const googleButton = () => html`<div class="or"><span>${t('or')}</span></div><button type="button" class="btn btn-outline google-btn" id="google"><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>${t('Continue with Google')}</button><p class="muted fb-note" id="google-msg" role="alert"></p>`;

function wireGoogle(root, ctx, next) {
  root.querySelector('#google')?.addEventListener('click', async () => {
    try { await signInGoogle(); await reloadUser(); ctx.navigate(next); } catch (e) { if (e?.code !== 'auth/popup-closed-by-user') root.querySelector('#google-msg').textContent = t('Could not sign in with Google. Please try again.'); }
  });
}

function loginPage(ctx, common) {
  const F = [{ name: 'email', label: 'Email', type: 'email', required: true, dir: 'ltr', autocomplete: 'username' }, { name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' }];
  const next = safeNext(ctx.query, url('/account/'));
  return { ...common, title: t('Sign in'), html: authBox(t('Student sign in'), html`<form class="form" id="f" novalidate>${F.map((f) => field(f))}<button class="btn" type="submit">${t('Sign in')}</button></form>${googleButton()}
    <p class="muted"><a href="${url('/account/password-reset/')}">${t('Forgot your password?')}</a></p><p>${t('New here?')} <a href="${url('/account/signup/')}">${t('Create a student account')}</a></p>`),
  after(root) {
    const form = root.querySelector('#f');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = formValues(form); const errors = validate(v, F); showErrors(form, errors); if (Object.keys(errors).length) return;
      busy(form, true);
      try { await signIn(v.email.toLowerCase(), v.password); await reloadUser(); ctx.navigate(next); } catch (err) { showErrors(form, { _: authMsg(err) }); busy(form, false); }
    });
    wireGoogle(root, ctx, next);
  } };
}

function signupPage(ctx, common) {
  const F = [{ name: 'full_name', label: 'Full name', required: true, maxlength: 120 }, { name: 'email', label: 'Email', type: 'email', required: true, dir: 'ltr' },
    { name: 'university', label: 'University / organization', maxlength: 200 }, { name: 'password1', label: 'Password', type: 'password', required: true, autocomplete: 'new-password' },
    { name: 'password2', label: 'Confirm password', type: 'password', required: true, autocomplete: 'new-password' }];
  const started = Date.now();
  return { ...common, title: t('Create account'), html: authBox(t('Create a student account'), html`<p class="muted">${t('Enroll in courses, request research projects and follow their status from one dashboard.')}</p>
    <form class="form" id="f" novalidate>${honeypot()}${F.map((f) => field(f))}<button class="btn" type="submit">${t('Create account')}</button></form>${googleButton()}<p>${t('Already registered?')} <a href="${url('/account/login/')}">${t('Sign in')}</a></p>`),
  after(root) {
    const form = root.querySelector('#f');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = formValues(form); const errors = validate(v, F);
      if (v.password1 && v.password1.length < 8) errors.password1 = t('This password is too short or too common.');
      if (v.password1 && v.password2 && v.password1 !== v.password2) errors.password2 = t('The two passwords do not match.');
      const spam = spamCheck(form, started); if (spam) errors._ = spam;
      showErrors(form, errors); if (Object.keys(errors).length) return;
      busy(form, true);
      try {
        auth.languageCode = getLang();
        const user = await signUp(v.email.toLowerCase(), v.password1, v.full_name);
        try { sessionStorage.setItem('sx_signup', JSON.stringify({ university: v.university })); } catch { /* ignore */ }
        await reloadUser();
        toast(t('Account created. We sent you an email to confirm your address.'));
        ctx.navigate(url('/account/confirm-email/'));
      } catch (err) { showErrors(form, { [err?.code === 'auth/email-already-in-use' ? 'email' : '_']: authMsg(err) }); busy(form, false); }
    });
    wireGoogle(root, ctx, url('/account/'));
  } };
}

function confirmPage(ctx, common) {
  const u = state.user;
  return { ...common, title: t('Confirm your email'), html: authBox(t('Confirm your email'), html`<p>${t('We sent a confirmation link to %(email)s. Open it to activate your student account.', { email: u.email })}</p>
    <p><button class="btn" id="recheck">${t('I confirmed my email')}</button> <button class="btn btn-outline" id="resend">${t('Send the email again')}</button></p>
    <p><button class="linkbtn" id="out">${t('Sign out')}</button></p>`),
  after(root) {
    const check = async () => { await reloadUser(); if (state.user.emailVerified) { await ensureProfile(); ctx.navigate(url('/account/')); return true; } return false; };
    root.querySelector('#recheck').addEventListener('click', async () => { if (!(await check())) toast(t('Your email is not confirmed yet.'), 'error'); });
    root.querySelector('#resend').addEventListener('click', async () => { try { auth.languageCode = getLang(); await resendVerification(); toast(t('We sent you a new confirmation email.')); } catch { toast(t('Too many requests. Please try again later.'), 'error'); } });
    root.querySelector('#out').addEventListener('click', async () => { await signOut(); ctx.navigate(url('/')); });
    window.addEventListener('focus', check, { once: true });
  } };
}

function resetPage(ctx, common) {
  const F = [{ name: 'email', label: 'Email', type: 'email', required: true, dir: 'ltr' }];
  return { ...common, title: t('Reset password'), html: authBox(t('Reset your password'), html`<p class="muted">${t('Enter your email and we will send you a link to choose a new password.')}</p>
    <form class="form" id="f" novalidate>${F.map((f) => field(f))}<button class="btn" type="submit">${t('Send reset link')}</button></form><div id="done" hidden><p>${t('If an account exists for that address, we sent a link to reset the password.')}</p></div>`),
  after(root) {
    const form = root.querySelector('#f');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = formValues(form); const errors = validate(v, F); showErrors(form, errors); if (Object.keys(errors).length) return;
      busy(form, true);
      try { auth.languageCode = getLang(); await sendPasswordResetEmail(auth, v.email.toLowerCase()); } catch { /* never reveal whether the address exists */ }
      form.hidden = true; root.querySelector('#done').hidden = false;
    });
  } };
}

// ----------------------------------------------------------------------------------------------- dashboard
const stBadge = (kind, value) => html`<span class="st st-${value}">${t(choiceLabel(kind, value))}</span>`;
const notifUrl = (n) => (n.url && n.url.startsWith('/account') ? url(n.url) : n.url);

async function dashboard() {
  const [enrs, reqs, notes] = await Promise.all([myEnrollments(), myRequests(), myNotifications()]);
  const active = enrs.filter((e) => ['approved', 'completed'].includes(e.status)).length;
  const waiting = enrs.filter((e) => e.status === 'pending').length + reqs.filter((r) => ['submitted', 'in_review'].includes(r.status)).length;
  return { section: 'dashboard', title: t('Dashboard'), heading: t('Welcome, %(name)s', { name: ([...(state.user.displayName || state.user.email).split(' ')][0]) }),
    html: html`<div class="pstats"><div><b>${active}</b><span>${t('Active courses')}</span></div><div><b>${reqs.length}</b><span>${t('Project requests')}</span></div><div><b>${waiting}</b><span>${t('Waiting for review')}</span></div></div>
<div class="pgrid"><section class="pcard"><h3>${t('My courses')}</h3>${enrs.slice(0, 5).map((e) => html`<p class="row"><a href="${url('/account/courses/' + e.program + '/')}">${e.program_title}</a>${stBadge('enrollStatus', e.status)}</p>`)}${enrs.length ? '' : html`<p class="empty">${t('You are not enrolled in any course yet.')}</p>`}<p><a class="btn btn-sm" href="${url('/training/')}">${t('Browse training')}</a></p></section>
<section class="pcard"><h3>${t('My projects')}</h3>${reqs.slice(0, 5).map((r) => html`<p class="row"><a href="${url('/account/projects/' + r._id + '/')}">${r.title}</a>${stBadge('requestStatus', r.status)}</p>`)}${reqs.length ? '' : html`<p class="empty">${t('No project requests yet.')}</p>`}<p><a class="btn btn-sm" href="${url('/account/projects/new/')}">${t('Request a new project')}</a></p></section>
<section class="pcard wide"><h3>${t('Latest notifications')}</h3>${notes.slice(0, 6).map((n) => html`<p class="row ${n.read ? '' : 'unread'}">${n.url ? html`<a href="${notifUrl(n)}">${n.text}</a>` : html`<span>${n.text}</span>`}<small>${fmtDate(n.created)}</small></p>`)}${notes.length ? '' : html`<p class="empty">${t('Nothing new.')}</p>`}</section></div>` };
}

async function courses() {
  const enrs = await myEnrollments();
  return { section: 'courses', title: t('My courses'), html: html`${enrs.map((e) => html`<section class="pcard"><p class="row"><a href="${url('/account/courses/' + e.program + '/')}"><strong>${e.program_title}</strong></a>${stBadge('enrollStatus', e.status)}</p></section>`)}
    ${enrs.length ? '' : html`<p class="empty">${t('You are not enrolled in any course yet.')}</p>`}<p><a class="btn" href="${url('/training/')}">${t('Browse training')}</a></p>` };
}

async function coursePage(ctx, slug) {
  const enr = await getMine('enrollments', `${state.user.uid}__${slug}`);
  if (!enr) return { section: 'courses', title: t('My courses'), html: html`<p class="empty">404</p>` };
  const program = await getItem('training', slug);
  const ok = ['approved', 'completed'].includes(enr.status);
  let mats = [];
  if (ok) { try { mats = (await getDocs(query(collection(db, 'materials'), where('program', '==', slug)))).docs.map((d) => ({ _id: d.id, ...norm(d.data()) })).sort((a, b) => (a.order || 0) - (b.order || 0)); } catch { /* none */ } }
  const cancellable = ['pending', 'waitlist', 'approved'].includes(enr.status);
  return { section: 'courses', title: enr.program_title, heading: enr.program_title, html: html`<p>${stBadge('enrollStatus', enr.status)} ${program ? html`<span class="tag">${t(choiceLabel('trainingKind', program.kind))}</span>${program.start_date ? html` <span class="tag tag-s">${fmtDate(program.start_date)}</span>` : ''}` : ''}</p>
    ${enr.note ? html`<div class="notice"><strong>${t('Message from the team')}</strong><p>${enr.note}</p></div>` : ''}${program ? linebreaks(tr(program, 'description')) : ''}
    <h3>${t('Course materials')}</h3>${ok ? (mats.length ? mats.map((m) => html`<p class="row"><span><strong>${m.title}</strong>${m.description ? html`<br><small class="muted">${m.description}</small>` : ''}</span>
      ${m.file ? html`<button class="btn btn-sm" data-file="${m.file}">${t('Download')}</button>` : m.link ? html`<a class="btn btn-sm" href="${m.link}" rel="noopener" target="_blank">${t('Open')}</a>` : ''}</p>`) : html`<p class="empty">${t('No materials have been added yet.')}</p>`) : html`<p class="empty">${t('Materials become available once your enrollment is approved.')}</p>`}
    ${cancellable ? html`<p><button class="linkbtn" id="cancel">${t('Cancel my enrollment')}</button></p>` : ''}`,
  after(root) {
    root.querySelectorAll('[data-file]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { await saveBlob(b.dataset.file); } catch { toast(t('Something went wrong'), 'error'); } b.disabled = false; }));
    root.querySelector('#cancel')?.addEventListener('click', async () => {
      if (!confirm(t('Cancel your enrollment?'))) return;
      const regRef = doc(db, 'registrations', enr.registration), reg = (await getDoc(regRef)).data();
      const batch = writeBatch(db);
      batch.update(regRef, { status: 'cancelled' });
      if (reg && ['pending', 'confirmed'].includes(reg.status)) {
        const stat = await getDoc(doc(db, 'trainingStats', slug));
        batch.set(doc(db, 'trainingStats', slug), { taken: Math.max((stat.exists() ? stat.data().taken : 1) - 1, 0), last: enr.registration });
      }
      batch.update(doc(db, 'enrollments', enr._id), { status: 'cancelled', updated: serverTimestamp() });
      await batch.commit();
      toast(t('Your enrollment was cancelled.')); ctx.navigate(url('/account/courses/'));
    });
  } };
}

// ----------------------------------------------------------------------------------------------- project requests
async function projects() {
  const reqs = await myRequests();
  return { section: 'projects', title: t('My projects'), html: html`<p><a class="btn" href="${url('/account/projects/new/')}">${t('Request a new project')}</a></p>
    ${reqs.map((r) => html`<section class="pcard"><p class="row"><a href="${url('/account/projects/' + r._id + '/')}"><strong>${r.title}</strong></a>${stBadge('requestStatus', r.status)}</p><p class="muted">${fmtDate(r.updated)}</p></section>`)}
    ${reqs.length ? '' : html`<p class="empty">${t('No project requests yet.')}</p>`}` };
}

const ALLOWED = ['.pdf', '.doc', '.docx', '.zip', '.png', '.jpg', '.jpeg', '.txt'];

async function projectForm(ctx, req) {
  const areas = await list('areas');
  const F = [{ name: 'title', label: 'Title', required: true, maxlength: 200 }, { name: 'summary', label: 'Summary', type: 'textarea', rows: 8, required: true, help: 'What is the research question and what do you plan to do?' },
    { name: 'research_area', label: 'Research area', type: 'select', blank: true, choices: areas.map((a) => [a._id, tr(a, 'title')]) }, { name: 'supervisor', label: 'Preferred supervisor', maxlength: 160 }];
  const v = req || {};
  return { section: 'projects', title: req ? req.title : t('New project request'), heading: req ? req.title : t('Request a new project'),
    html: html`<form class="form" id="f" novalidate>${F.map((f) => field({ ...f, choices: f.choices && f.choices.map(([a, b]) => [a, b]) }, v[f.name] ?? ''))}
      <div class="field"><label>${t('Attachment')}</label><input type="file" name="attachment" accept="${ALLOWED.join(',')}">${v.attachment_name ? html`<small class="help">${v.attachment_name}</small>` : ''}<small class="help">${t('Optional: proposal or outline (PDF, Word, ZIP, image; max 4 MB).')}</small><ul class="errorlist" hidden></ul></div>
      <p class="muted">${t('Save a draft to keep working on it, or submit it to our team for review.')}</p>
      <button class="btn btn-ghost" type="submit" data-do="draft">${t('Save draft')}</button> <button class="btn" type="submit" data-do="submit">${req && req.status === 'rejected' ? t('Resubmit for review') : t('Submit for review')}</button></form>`,
  after(root) {
    const form = root.querySelector('#f'); let action = 'draft';
    form.querySelectorAll('button[type=submit]').forEach((b) => b.addEventListener('click', () => { action = b.dataset.do; }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const vals = formValues(form), errors = validate(vals, F), file = form.querySelector('[name=attachment]').files[0];
      if (file) {
        if (!ALLOWED.some((x) => file.name.toLowerCase().endsWith(x))) errors.attachment = t('Unsupported file type. Use PDF, Word, ZIP, image or text.');
        else if (file.size > MAX_STUDENT_BYTES) errors.attachment = t('The file is larger than 4 MB.');
      }
      showErrors(form, errors); if (Object.keys(errors).length) return;
      busy(form, true);
      try {
        let attachment = v.attachment || '', attachment_name = v.attachment_name || '';
        if (file) {
          const up = await uploadPrivateFile(file, { kind: 'attachment', owner: state.user.uid });
          if (attachment) deletePrivateFile(attachment).catch(() => {});
          attachment = up.id; attachment_name = up.name;
        }
        const submit = action === 'submit';
        const base = { title: vals.title, summary: vals.summary, research_area: vals.research_area || '', supervisor: vals.supervisor || '', attachment, attachment_name, updated: serverTimestamp() };
        let id = req?._id;
        if (req) await updateDoc(doc(db, 'projectRequests', id), { ...base, status: submit ? 'submitted' : req.status === 'rejected' ? 'rejected' : 'draft', ...(submit ? { submitted_at: serverTimestamp() } : {}) });
        else { id = crypto.randomUUID().replace(/-/g, '').slice(0, 20); await setDoc(doc(db, 'projectRequests', id), { uid: state.user.uid, ...base, status: submit ? 'submitted' : 'draft', review_note: '', submitted_at: submit ? serverTimestamp() : null, project: '', created: serverTimestamp() }); }
        if (submit) await notify(t('Your project request "%(title)s" was submitted for review.', { title: vals.title }), `/account/projects/${id}/`);
        toast(submit ? t('Your request was submitted. We will review it and reply here.') : t('Draft saved.'));
        ctx.navigate(url(`/account/projects/${id}/`));
      } catch (err) { console.error(err); showErrors(form, { _: t('Something went wrong') }); busy(form, false); }
    });
  } };
}

async function projectPage(ctx, id) {
  const req = await getMine('projectRequests', id);
  if (!req) return { section: 'projects', title: t('My projects'), html: html`<p class="empty">404</p>` };
  const editable = ['draft', 'rejected'].includes(req.status);
  if (editable && ctx.query.get('edit')) return projectForm(ctx, req);
  let area = null; if (req.research_area) area = await getItem('areas', req.research_area);
  return { section: 'projects', title: req.title, heading: req.title, html: html`<p>${stBadge('requestStatus', req.status)}${area ? html` <span class="tag">${tr(area, 'title')}</span>` : ''}</p>
    ${req.review_note ? html`<div class="notice"><strong>${t('Message from the team')}</strong><p>${req.review_note}</p></div>` : ''}${linebreaks(req.summary)}
    ${req.supervisor ? html`<p><strong>${t('Preferred supervisor')}:</strong> ${req.supervisor}</p>` : ''}${req.attachment ? html`<p><button class="linkbtn" id="att">📎 ${req.attachment_name || t('Attachment')}</button></p>` : ''}
    ${editable ? html`<p><a class="btn" href="?edit=1">${t('Edit')}</a></p>` : ''}${req.status === 'draft' ? html`<p><button class="linkbtn" id="del">${t('Delete draft')}</button></p>` : ''}
    <p><a class="back" href="${url('/account/projects/')}">${t('All my projects')}</a></p>`,
  after(root) {
    root.querySelector('#att')?.addEventListener('click', () => saveBlob(req.attachment).catch(() => toast(t('Something went wrong'), 'error')));
    root.querySelector('#del')?.addEventListener('click', async () => {
      if (!confirm(t('Delete this draft?'))) return;
      await deleteDoc(doc(db, 'projectRequests', id)); if (req.attachment) deletePrivateFile(req.attachment).catch(() => {});
      toast(t('Draft deleted.')); ctx.navigate(url('/account/projects/'));
    });
  } };
}

// ----------------------------------------------------------------------------------------------- profile / notifications
async function profilePage(ctx, p) {
  const F = [{ name: 'full_name', label: 'Full name', required: true, maxlength: 120 }, { name: 'university', label: 'University / organization', maxlength: 200 },
    { name: 'field_of_study', label: 'Field of study', maxlength: 160 }, { name: 'phone', label: 'Phone', maxlength: 40 },
    { name: 'language', label: 'Language', type: 'select', blank: true, choices: [['en', 'English'], ['ar', 'العربية']] }];
  const PW = [{ name: 'old', label: 'Current password', type: 'password', required: true }, { name: 'p1', label: 'New password', type: 'password', required: true }, { name: 'p2', label: 'Confirm password', type: 'password', required: true }];
  return { section: 'profile', title: t('Profile & password'), html: html`<form class="form" id="f" novalidate>${F.map((f) => field(f, p[f.name] ?? ''))}<button class="btn" type="submit">${t('Save')}</button></form>
    ${state.user.providerData.some((x) => x.providerId === 'password') ? html`<h3>${t('Change password')}</h3><form class="form" id="pw" novalidate>${PW.map((f) => field(f))}<button class="btn" type="submit">${t('Change password')}</button></form>` : ''}`,
  after(root) {
    const form = root.querySelector('#f');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = formValues(form), errors = validate(v, F); showErrors(form, errors); if (Object.keys(errors).length) return;
      await updateProfile({ full_name: v.full_name, university: v.university || '', field_of_study: v.field_of_study || '', phone: v.phone || '', language: v.language || '' });
      toast(t('Profile saved.'));
    });
    const pw = root.querySelector('#pw');
    pw?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = formValues(pw), errors = validate(v, PW);
      if (v.p1 && v.p1.length < 8) errors.p1 = t('This password is too short or too common.');
      if (v.p1 !== v.p2) errors.p2 = t('The two passwords do not match.');
      showErrors(pw, errors); if (Object.keys(errors).length) return;
      try { await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, v.old)); await updatePassword(auth.currentUser, v.p1); toast(t('Password changed.')); pw.reset(); }
      catch (err) { showErrors(pw, { old: authMsg(err) }); }
    });
  } };
}

async function notificationsPage() {
  const items = await myNotifications();
  await markAllRead(items);
  state.unread = 0;
  return { section: 'notifications', title: t('Notifications'), html: html`${items.map((n) => html`<p class="row">${n.url ? html`<a href="${notifUrl(n)}">${n.text}</a>` : html`<span>${n.text}</span>`}<small>${fmtDate(n.created, { dateStyle: 'medium', timeStyle: 'short' })}</small></p>`)}${items.length ? '' : html`<p class="empty">${t('Nothing new.')}</p>`}` };
}

export { raw, isEmail, getProfile, setLang };
