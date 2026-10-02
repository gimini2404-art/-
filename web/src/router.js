/* History-API router. Routes map to lazily loaded page modules; each module's default export receives a context
   object and returns { title, description, html, layout?, bodyClass?, meta?, jsonld?, draft?, after? } or null (404). */

const routes = [
  ['', () => import('./pages/home.js')],
  ['/about', () => import('./pages/about.js')],
  ['/research-areas', () => import('./pages/areas.js')],
  ['/research-areas/:slug', () => import('./pages/area.js')],
  ['/services', () => import('./pages/services.js')],
  ['/research-hub', () => import('./pages/hub.js')],
  ['/research-hub/:slug', () => import('./pages/hubItem.js')],
  ['/collaborations', () => import('./pages/collaborations.js')],
  ['/projects', () => import('./pages/projects.js')],
  ['/projects/:slug', () => import('./pages/project.js')],
  ['/publications', () => import('./pages/publications.js')],
  ['/publications/:slug', () => import('./pages/article.js')],
  ['/training', () => import('./pages/training.js')],
  ['/training/:slug/register', () => import('./pages/trainingRegister.js')],
  ['/opportunities', () => import('./pages/opportunities.js')],
  ['/contact', () => import('./pages/contact.js')],
  ['/contact/thanks', () => import('./pages/contactThanks.js')],
  ['/team/:slug', () => import('./pages/team.js')],
  ['/news', () => import('./pages/posts.js')],
  ['/news/:slug', () => import('./pages/post.js')],
  ['/search', () => import('./pages/search.js')],
  ['/p/:slug', () => import('./pages/page.js')],
  ['/newsletter/unsubscribe/:token', () => import('./pages/unsubscribe.js')],
  ['/account', () => import('./portal/index.js')],
  ['/account/*', () => import('./portal/index.js')],
];

const compiled = routes.map(([pattern, load]) => {
  const keys = [];
  const rx = pattern.replace(/\/\*$/, '(?:/(.*))?').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  if (pattern.endsWith('/*')) keys.push('rest');
  return { rx: new RegExp(`^${rx}/?$`), keys, load };
});

export function match(path) {
  for (const r of compiled) {
    const m = r.rx.exec(path);
    if (m) return { load: r.load, params: Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1] ? decodeURIComponent(m[i + 1]) : ''])) };
  }
  return null;
}
