/* Single source of truth for the content model (ported from the Django models).
   Used by: public pages (labels, choices, ordering), the admin forms, and the snapshot builder.
   Bilingual fields are stored as `<name>_en` and `<name>_ar` (like django-modeltranslation). */

// ---- choices: [value, English label] (labels are translated through i18n) -----------------------
export const CHOICES = {
  aboutKind: [['about', 'About SiaNexis'], ['mission', 'Mission'], ['approach', 'Research approach']],
  teamGroup: [['team', 'Team'], ['advisory', 'Advisory Board']],
  collabType: [['academic', 'Academic collaboration'], ['hospital', 'Hospital collaboration'], ['research_center', 'Research center collaboration'],
    ['international', 'International collaboration'], ['multicenter', 'Multicenter collaboration']],
  projectStatus: [['planned', 'Planned'], ['ongoing', 'Ongoing'], ['completed', 'Completed']],
  pubKind: [['paper', 'Published paper'], ['manuscript', 'Ongoing manuscript'], ['output', 'Research output']],
  contentType: [['research', 'Research'], ['review', 'Review'], ['case_study', 'Case study'], ['short_report', 'Short report'], ['other', 'Article']],
  hubCategory: [['program', 'Research Programs'], ['ongoing', 'Ongoing Studies'], ['multicenter', 'Multicenter Studies'], ['network', 'Research Networks'],
    ['collaboration', 'Research Collaborations'], ['opportunity', 'Research Opportunities'], ['project', 'Research Projects']],
  hubStatus: [['planned', 'Planned'], ['recruiting', 'Recruiting'], ['ongoing', 'Ongoing'], ['completed', 'Completed']],
  trainingKind: [['program', 'Research training program'], ['workshop', 'Workshop'], ['course', 'Research course'],
    ['institutional', 'Institutional training'], ['mentorship', 'Research mentorship']],
  oppKind: [['research', 'Research opportunity'], ['open_project', 'Open project'], ['collaborators', 'Call for collaborators'],
    ['sites', 'Call for research sites'], ['volunteer', 'Volunteer / expert opportunity'], ['student', 'Student / researcher opportunity']],
  contactType: [['research_project', 'Research project'], ['data_analysis', 'Statistical / Data analysis'], ['collaboration', 'Research collaboration'],
    ['multicenter', 'Multicenter study'], ['partnership', 'Institutional partnership'], ['training', 'Training'], ['other', 'Other']],
  contactStatus: [['new', 'New'], ['in_progress', 'In progress'], ['closed', 'Closed']],
  regStatus: [['pending', 'Pending'], ['confirmed', 'Confirmed'], ['waitlist', 'Waiting list'], ['cancelled', 'Cancelled']],
  enrollStatus: [['pending', 'Pending'], ['approved', 'Approved'], ['waitlist', 'Waiting list'], ['completed', 'Completed'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']],
  requestStatus: [['draft', 'Draft'], ['submitted', 'Submitted'], ['in_review', 'In review'], ['approved', 'Approved'], ['running', 'Running'],
    ['completed', 'Completed'], ['rejected', 'Rejected']],
  sectionKind: [['background', 'Background'], ['methods', 'Methods'], ['results', 'Results'], ['conclusion', 'Conclusion'], ['introduction', 'Introduction'],
    ['methodology', 'Methodology'], ['discussion', 'Discussion'], ['limitations', 'Limitations'], ['conclusions', 'Conclusions'],
    ['data_availability', 'Data availability'], ['author_info', 'Author information'], ['ethics', 'Ethics declarations'], ['other', 'Other section']],
  figKind: [['figure', 'Figure'], ['table', 'Table']],
  linkKind: [['similar', 'Similar content'], ['related', 'Related subject / link']],
  role: [['admin', 'Administrator'], ['editor', 'Editor'], ['contributor', 'Contributor']],
};

export const choiceLabel = (name, value) => (CHOICES[name].find(([v]) => v === value) || [value, value])[1];

// ---- field helpers ---------------------------------------------------------------------------
const F = {
  text: (name, label, o = {}) => ({ name, label, type: 'text', ...o }),
  area: (name, label, o = {}) => ({ name, label, type: 'textarea', rows: 5, ...o }),
  url: (name, label, o = {}) => ({ name, label, type: 'url', ...o }),
  email: (name, label, o = {}) => ({ name, label, type: 'email', ...o }),
  int: (name, label, o = {}) => ({ name, label, type: 'int', ...o }),
  float: (name, label, o = {}) => ({ name, label, type: 'float', ...o }),
  bool: (name, label, o = {}) => ({ name, label, type: 'bool', ...o }),
  date: (name, label, o = {}) => ({ name, label, type: 'date', ...o }),
  datetime: (name, label, o = {}) => ({ name, label, type: 'datetime', ...o }),
  select: (name, label, choices, o = {}) => ({ name, label, type: 'select', choices, ...o }),
  image: (name, label, o = {}) => ({ name, label, type: 'image', ...o }),
  file: (name, label, o = {}) => ({ name, label, type: 'file', ...o }),
  ref: (name, label, to, o = {}) => ({ name, label, type: 'ref', to, ...o }),
  refs: (name, label, to, o = {}) => ({ name, label, type: 'refs', to, ...o }),
  slug: (o = {}) => ({ name: 'slug', label: 'Slug', type: 'slug', help: 'Auto-filled from the title.', ...o }),
  list: (name, label, item, fields, o = {}) => ({ name, label, type: 'list', item, fields, ...o }),
};
const T = { tr: true }; // translatable shortcut

const PUBLISH = [
  F.bool('is_published', 'Published', { help: 'Untick to hide from the public site.', default: true }),
  F.datetime('publish_at', 'Publication date', { help: 'Optional: show on the site from this date/time.', advanced: true }),
  F.datetime('unpublish_at', 'Unpublish at', { help: 'Optional: hide from the site after this date/time.', advanced: true }),
  F.int('order', 'Display order', { help: 'Lower numbers appear first.', default: 0, advanced: true }),
];
const SEO = [
  F.text('meta_title', 'Meta title', { ...T, max: 70, help: 'Leave blank to use the title.', seo: true }),
  F.text('meta_description', 'Meta description', { ...T, max: 170, seo: true }),
];

const pubFields = [
  F.select('kind', 'Type', CHOICES.pubKind, { default: 'paper', required: true }),
  F.text('title', 'Title', { ...T, max: 300, required: true }),
  F.text('authors', 'Authors', { max: 500, required: true }),
  F.text('journal', 'Journal', { max: 200 }),
  F.int('year', 'Year'),
  F.text('doi', 'DOI', { max: 120, help: 'e.g. 10.1000/xyz123 (no URL prefix)' }),
  F.url('external_link', 'External link'),
  F.file('pdf', 'PDF file'),
  F.ref('related_project', 'Related project', 'projects'),
];

// ---- collections ---------------------------------------------------------------------------------
export const SCHEMA = {
  pages: {
    label: 'Page', plural: 'Pages', title: 'title', slug: true, publish: true, snapshot: true, group: 'website',
    order: [['order', 1], ['title', 1]],
    fields: [F.text('title', 'Title', { ...T, max: 140, required: true }), F.slug(), F.text('summary', 'Summary', { ...T, max: 240 }),
      F.area('body', 'Content', { ...T, rows: 12, help: 'Plain text. Blank lines become paragraphs.' }),
      F.bool('show_in_menu', 'Show in menu'), ...PUBLISH, ...SEO],
  },
  aboutSections: {
    label: 'About section', plural: 'About sections', title: 'title', publish: true, snapshot: true, group: 'website',
    order: [['order', 1]],
    fields: [F.select('kind', 'Type', CHOICES.aboutKind, { required: true }), F.text('title', 'Title', { ...T, max: 140, required: true }),
      F.area('body', 'Content', { ...T, rows: 8, required: true }), F.image('image', 'Image'), ...PUBLISH],
  },
  team: {
    label: 'Team member', plural: 'Team members', title: 'name', slug: true, publish: true, snapshot: true, group: 'website',
    order: [['group', 1], ['order', 1], ['name', 1]],
    fields: [F.select('group', 'Group', CHOICES.teamGroup, { default: 'team' }), F.text('name', 'Name', { ...T, max: 120, required: true }), F.slug(),
      F.text('role', 'Role', { ...T, max: 160, required: true }), F.text('affiliation', 'Affiliation', { ...T, max: 200 }),
      F.area('bio', 'Biography', { ...T, rows: 6 }), F.image('photo', 'Photo'), F.url('profile_url', 'Profile link'),
      F.text('orcid', 'ORCID', { max: 19, help: 'e.g. 0000-0002-1825-0097' }), F.url('google_scholar_url', 'Google Scholar URL'),
      F.refs('publications', 'Publications', 'publications'), ...PUBLISH],
  },
  areas: {
    label: 'Research area', plural: 'Research areas', title: 'title', slug: true, publish: true, snapshot: true, group: 'research',
    order: [['order', 1], ['title', 1]],
    fields: [F.text('title', 'Title', { ...T, max: 120, required: true }), F.slug(), F.text('summary', 'Summary', { ...T, max: 240 }),
      F.area('description', 'Description', { ...T, rows: 8 }), F.text('icon', 'Icon', { max: 8, help: 'An emoji or short symbol.' }),
      F.image('image', 'Image'), ...PUBLISH, ...SEO],
  },
  serviceCategories: {
    label: 'Service category', plural: 'Service categories', title: 'title', slug: true, publish: true, snapshot: true, group: 'research',
    order: [['order', 1], ['title', 1]],
    fields: [F.text('title', 'Title', { ...T, max: 120, required: true }), F.slug(), F.text('description', 'Description', { ...T, max: 300 }), ...PUBLISH],
  },
  services: {
    label: 'Service', plural: 'Services', title: 'title', publish: true, snapshot: true, group: 'research',
    order: [['category', 1], ['order', 1], ['title', 1]],
    fields: [F.ref('category', 'Category', 'serviceCategories', { required: true }), F.text('title', 'Title', { ...T, max: 140, required: true }),
      F.area('description', 'Description', { ...T, rows: 5 }), ...PUBLISH],
  },
  organizations: {
    label: 'Organization', plural: 'Organizations', title: 'name', snapshot: true, group: 'research', publish: false,
    order: [['name', 1]],
    fields: [F.text('name', 'Name', { ...T, max: 200, required: true }), F.text('country', 'Country', { ...T, max: 80 }), F.image('logo', 'Logo'),
      F.url('website', 'Website'), F.bool('is_partner', 'Partner', { help: 'Show this logo in the partners strip on the home page.' })],
  },
  collaborations: {
    label: 'Collaboration', plural: 'Collaborations', title: 'organization_name', publish: true, snapshot: true, group: 'research',
    order: [['collaboration_type', 1], ['order', 1], ['organization_name', 1]],
    fields: [F.text('organization_name', 'Organization name', { ...T, max: 200, required: true }), F.text('country', 'Country', { ...T, max: 80 }),
      F.select('collaboration_type', 'Collaboration type', CHOICES.collabType, { required: true }),
      F.area('description', 'Project description', { ...T, rows: 5 }), F.image('logo', 'Logo'), F.url('link', 'Website / link'),
      F.float('latitude', 'Latitude', { help: "Position on the map. Use the 'Fill coordinates from country' action, or enter manually." }),
      F.float('longitude', 'Longitude'), ...PUBLISH],
  },
  projects: {
    label: 'Project', plural: 'Projects', title: 'title', slug: true, publish: true, snapshot: true, group: 'research',
    order: [['order', 1], ['created', -1]],
    fields: [F.text('title', 'Title', { ...T, max: 200, required: true }), F.slug(), F.ref('research_area', 'Research area', 'areas'),
      F.area('problem', 'Research question / problem', { ...T, rows: 6 }), F.area('role', 'SiaNexis role', { ...T, rows: 4 }),
      F.area('methodology', 'Methodology', { ...T, rows: 5 }), F.area('outcome', 'Outcome', { ...T, rows: 5 }),
      F.select('status', 'Status', CHOICES.projectStatus, { default: 'ongoing' }),
      F.refs('institutions', 'Collaborating institutions', 'organizations'), F.image('image', 'Image'),
      F.bool('featured', 'Featured', { help: 'Show on the home page.' }), ...PUBLISH, ...SEO],
  },
  publications: {
    label: 'Publication', plural: 'Publications', title: 'title', slug: true, publish: true, snapshot: true, group: 'research',
    order: [['year', -1], ['order', 1], ['title', 1]],
    // heavy article parts are not copied into the public snapshot (the article page reads the document itself)
    heavy: ['author_list', 'sections', 'figures', 'references', 'links', 'abstract', 'abstract_background', 'abstract_methods', 'abstract_results',
      'abstract_conclusion', 'rights_text'],
    fields: [...pubFields, F.slug(),
      F.select('content_type', 'Content type', CHOICES.contentType, { default: 'research', article: true }),
      F.bool('open_access', 'Open access', { default: true, article: true }),
      F.date('published_date', 'Publication date', { article: true }), F.date('received_date', 'Received', { article: true }),
      F.date('accepted_date', 'Accepted', { article: true }),
      F.text('volume', 'Volume', { max: 20, article: true }), F.text('issue', 'Issue', { max: 20, article: true }),
      F.text('article_number', 'Article number', { max: 20, article: true }), F.text('publisher', 'Publisher', { max: 120, article: true }),
      F.text('issn', 'ISSN', { max: 20, article: true }), F.text('license', 'License', { max: 60, help: 'e.g. CC BY 4.0', article: true }),
      F.url('license_url', 'License URL', { article: true }),
      F.text('keywords', 'Keywords', { max: 300, help: 'Comma separated.', article: true }),
      F.text('subjects', 'Subjects', { max: 300, help: 'Comma separated. Shown as related subjects.', article: true }),
      F.area('abstract', 'Abstract', { rows: 6, help: 'Use this for an unstructured abstract.', article: true }),
      F.area('abstract_background', 'Abstract: background', { rows: 4, article: true }), F.area('abstract_methods', 'Abstract: methods', { rows: 4, article: true }),
      F.area('abstract_results', 'Abstract: results', { rows: 4, article: true }), F.area('abstract_conclusion', 'Abstract: conclusion', { rows: 4, article: true }),
      F.area('rights_text', 'Rights and permissions', { rows: 3, help: 'Rights and permissions statement.', article: true }),
      F.int('accesses', 'Accesses', { article: true }), F.int('citations', 'Citations', { article: true }),
      F.int('altmetric', 'Altmetric', { article: true }), F.int('mentions', 'Mentions', { article: true }),
      F.list('author_list', 'Article authors', 'Article author', [
        F.text('name', 'Name', { max: 140, required: true, help: 'Full name as displayed.' }), F.text('given_name', 'Given name', { max: 80 }),
        F.text('family_name', 'Family name', { max: 80 }), F.text('affiliation', 'Affiliation', { max: 300 }),
        F.bool('corresponding', 'Corresponding author'), F.email('email', 'Email'), F.text('orcid', 'ORCID', { max: 19 })], { article: true }),
      F.list('sections', 'Article sections', 'Article section', [
        F.select('kind', 'Type', CHOICES.sectionKind, { required: true }), F.text('heading', 'Heading', { max: 160, help: 'Leave blank to use the standard title.' }),
        F.area('body', 'Content', { rows: 10, required: true,
          help: "Blank line = new paragraph. '### Title' = sub-heading. '- item' = bullet. [12] links to reference 12. [[fig:1]] / [[table:1]] place a figure or table." })], { article: true }),
      F.list('figures', 'Figures & tables', 'Figure / table', [
        F.select('kind', 'Type', CHOICES.figKind, { default: 'figure' }), F.int('number', 'Number', { default: 1 }),
        F.text('label', 'Label', { max: 20, help: 'e.g. Fig. 1 or Table 1' }), F.text('caption', 'Caption', { max: 500 }), F.image('image', 'Image'),
        F.area('table_html', 'Table HTML', { rows: 6, help: 'HTML <table> for tables.' }), F.text('note', 'Note', { max: 500, help: 'Footnote under the figure/table.' })], { article: true }),
      F.list('references', 'References', 'Reference', [
        F.int('number', 'Number', { required: true }), F.area('text', 'Reference text', { rows: 3, required: true, help: 'Full reference as printed.' }),
        F.text('authors', 'Authors', { max: 500 }), F.text('title', 'Title', { max: 500 }), F.text('source', 'Source', { max: 300, help: 'Journal / publisher and year.' }),
        F.text('doi', 'DOI', { max: 120 }), F.url('url', 'URL')], { article: true }),
      F.list('links', 'Similar / related links', 'Similar / related link', [
        F.select('kind', 'Type', CHOICES.linkKind, { default: 'similar' }), F.text('title', 'Title', { max: 300, required: true }),
        F.url('url', 'URL', { required: true }), F.text('source', 'Source', { max: 160 })], { article: true }),
      ...PUBLISH],
  },
  hub: {
    label: 'Research Hub item', plural: 'Research Hub items', title: 'title', slug: true, publish: true, snapshot: true, group: 'research',
    order: [['category', 1], ['order', 1], ['created', -1]],
    fields: [F.select('category', 'Category', CHOICES.hubCategory, { required: true }), F.text('title', 'Title', { ...T, max: 200, required: true }), F.slug(),
      F.text('summary', 'Summary', { ...T, max: 300 }), F.area('description', 'Description', { ...T, rows: 8 }),
      F.ref('research_area', 'Research area', 'areas'), F.select('status', 'Status', CHOICES.hubStatus, { default: 'ongoing' }),
      F.image('image', 'Image'), F.url('link', 'Link'), F.ref('related_project', 'Related project', 'projects'), ...PUBLISH, ...SEO],
  },
  training: {
    label: 'Training program', plural: 'Training programs', title: 'title', slug: true, publish: true, snapshot: true, group: 'engagement',
    order: [['kind', 1], ['order', 1], ['start_date', -1]],
    fields: [F.select('kind', 'Type', CHOICES.trainingKind, { required: true }), F.text('title', 'Title', { ...T, max: 200, required: true }), F.slug(),
      F.text('summary', 'Summary', { ...T, max: 300 }), F.area('description', 'Description', { ...T, rows: 8 }), F.date('start_date', 'Start date'),
      F.text('duration', 'Duration', { ...T, max: 80 }), F.text('format', 'Format', { ...T, max: 80, help: 'Online / In person / Hybrid' }),
      F.url('registration_link', 'Registration link', { help: 'External link. Leave blank to use the built-in registration form.' }),
      F.bool('registration_open', 'Registration open', { default: true }),
      F.int('capacity', 'Capacity (seats)', { help: 'Maximum seats. Leave blank for unlimited; extra sign-ups go on a waiting list.' }),
      F.image('image', 'Image'), ...PUBLISH],
  },
  opportunities: {
    label: 'Opportunity', plural: 'Opportunities', title: 'title', slug: true, publish: true, snapshot: true, group: 'engagement',
    order: [['kind', 1], ['order', 1], ['deadline', 1]],
    fields: [F.select('kind', 'Type', CHOICES.oppKind, { required: true }), F.text('title', 'Title', { ...T, max: 200, required: true }), F.slug(),
      F.text('summary', 'Summary', { ...T, max: 300 }), F.area('description', 'Description', { ...T, rows: 8 }), F.date('deadline', 'Deadline'),
      F.url('apply_link', 'Application link', { help: 'Leave blank to use the contact form.' }), ...PUBLISH],
  },
  posts: {
    label: 'News post', plural: 'News posts', title: 'title', slug: true, publish: true, snapshot: true, group: 'website',
    order: [['published_at', -1], ['created', -1]],
    fields: [F.text('title', 'Title', { ...T, max: 200, required: true }), F.slug(), F.text('summary', 'Summary', { ...T, max: 300 }),
      F.area('body', 'Content', { ...T, rows: 14, required: true }), F.image('image', 'Image'), F.text('author_name', 'Author', { max: 120 }),
      F.date('published_at', 'Publication date', { help: 'Shown on the post and used for ordering.', defaultToday: true }), ...PUBLISH, ...SEO],
  },
  metrics: {
    label: 'Impact metric', plural: 'Impact metrics', title: 'label', publish: true, snapshot: true, group: 'website',
    order: [['order', 1]],
    fields: [F.text('label', 'Label', { ...T, max: 80, required: true }), F.int('value', 'Value', { required: true }),
      F.text('suffix', 'Suffix', { max: 8, help: 'e.g. + or %' }), ...PUBLISH],
  },
};

export const SETTINGS_FIELDS = [
  F.text('site_name', 'Site name', { ...T, max: 80 }), F.text('tagline', 'Tagline', { ...T, max: 160 }), F.image('logo', 'Logo'),
  F.text('hero_title', 'Hero title', { ...T, max: 160 }), F.area('hero_text', 'Hero text', { ...T, rows: 3 }),
  F.area('intro_text', 'Introduction text', { ...T, rows: 5, help: "Short 'about SiaNexis' text on the home page." }),
  F.text('cta_title', 'Call-to-action title', { ...T, max: 120 }), F.text('cta_text', 'Call-to-action text', { ...T, max: 240 }),
  F.email('contact_email', 'Contact email'), F.text('phone', 'Phone', { max: 40 }), F.text('address', 'Address', { ...T, max: 200 }),
  F.url('linkedin_url', 'LinkedIn URL'), F.url('twitter_url', 'X / Twitter URL'), F.text('footer_text', 'Footer text', { ...T, max: 200 }),
  F.text('default_meta_description', 'Default meta description', { ...T, max: 170 }),
  F.text('announcement_text', 'Announcement text', { ...T, max: 240, help: 'Optional notice bar shown at the top of article pages.' }),
  F.url('announcement_url', 'Announcement URL'),
  F.area('analytics_snippet', 'Analytics script', { rows: 3, help: 'Optional tracking script (e.g. analytics).' }),
  F.text('ga_measurement_id', 'Google Analytics ID', { max: 20, help: 'Google Analytics 4 ID, e.g. G-XXXXXXXXXX. Loaded only after the visitor accepts cookies.' }),
  F.text('plausible_domain', 'Plausible domain', { max: 120, help: 'Plausible domain, e.g. sianexis.com (cookie-free analytics).' }),
  F.text('privacy_url', 'Privacy policy link', { max: 200, help: 'Link of the privacy policy page, e.g. /en/p/privacy/' }),
  F.text('cloudinary_cloud', 'Cloudinary cloud name', { max: 60, help: 'Free image hosting. Create a free account at cloudinary.com and paste the cloud name.' }),
  F.text('cloudinary_preset', 'Cloudinary upload preset', { max: 60, help: 'An unsigned upload preset (Settings > Upload > Upload presets).' }),
];

export const SNAPSHOT_COLLECTIONS = Object.entries(SCHEMA).filter(([, s]) => s.snapshot).map(([k]) => k);

export const GROUPS = [['website', 'Website', '🌐'], ['research', 'Research & publications', '🔬'], ['engagement', 'Engagement', '📬']];

export const fieldsOf = (col) => (col === 'settings' ? SETTINGS_FIELDS : SCHEMA[col].fields);

/** Names of all stored keys for a collection (translatable fields expand to _en/_ar). */
export function storedKeys(col) {
  const keys = [];
  for (const f of fieldsOf(col)) {
    if (f.tr) keys.push(`${f.name}_en`, `${f.name}_ar`); else keys.push(f.name);
  }
  return keys;
}
