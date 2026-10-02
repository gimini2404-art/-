// Sample content (EN + AR) used to demo the site and in end-to-end tests. Loaded on top of seed/base.json.
const now = new Date().toISOString();
const pub = { is_published: true, publish_at: null, unpublish_at: null, order: 0, created: now, updated: now };

export const extra = {
  collections: {
    organizations: [
      { _id: 'org-1', name_en: 'Cairo University', name_ar: 'جامعة القاهرة', country_en: 'Egypt', country_ar: 'مصر', website: 'https://cu.edu.eg', is_partner: false, logo: '' },
      { _id: 'org-2', name_en: 'London School of Hygiene & Tropical Medicine', name_ar: 'كلية لندن للصحة والطب الاستوائي', country_en: 'United Kingdom', country_ar: 'المملكة المتحدة', website: 'https://www.lshtm.ac.uk', is_partner: false, logo: '' },
    ],
    projects: [
      { _id: 'celiac-mental-health', slug: 'celiac-mental-health', title_en: 'Anxiety and depression in celiac disease', title_ar: 'القلق والاكتئاب في مرض السيلياك',
        research_area: 'psychiatry', problem_en: 'Do people with celiac disease have higher rates of anxiety and depression?', problem_ar: 'هل ترتفع معدلات القلق والاكتئاب لدى مرضى السيلياك؟',
        role_en: 'Study design, statistics and manuscript support.', role_ar: 'تصميم الدراسة والتحليل الإحصائي ودعم كتابة المخطوط.',
        methodology_en: 'Systematic review and random-effects meta-analysis.', methodology_ar: 'مراجعة منهجية وتحليل تجميعي بنموذج التأثيرات العشوائية.',
        outcome_en: 'Published in 2024.', outcome_ar: 'نُشرت في 2024.', status: 'completed', institutions: ['org-1', 'org-2'], image: '', featured: true, ...pub },
      { _id: 'sleep-and-mood', slug: 'sleep-and-mood', title_en: 'Sleep and mood in young adults', title_ar: 'النوم والمزاج لدى الشباب', research_area: 'psychiatry',
        problem_en: 'How does sleep duration relate to mood in university students?', problem_ar: 'كيف ترتبط مدة النوم بالمزاج لدى طلاب الجامعات؟', role_en: '', role_ar: '',
        methodology_en: 'Cross-sectional survey.', methodology_ar: 'مسح مقطعي.', outcome_en: '', outcome_ar: '', status: 'ongoing', institutions: ['org-1'], image: '', featured: true, ...pub, order: 1 },
    ],
    posts: [
      { _id: 'welcome', slug: 'welcome', title_en: 'Welcome to the new SiaNexis website', title_ar: 'مرحبًا بكم في موقع SiaNexis الجديد', summary_en: 'A faster site, student accounts and article pages.',
        summary_ar: 'موقع أسرع وحسابات للطلاب وصفحات للأبحاث.', body_en: 'We rebuilt our website.\n\nExplore research areas, services and publications.',
        body_ar: 'أعدنا بناء موقعنا.\n\nاستكشف المجالات البحثية والخدمات والمنشورات.', image: '', author_name: 'SiaNexis Team', published_at: '2026-09-01', ...pub },
      { _id: 'workshop-announced', slug: 'workshop-announced', title_en: 'New meta-analysis workshop', title_ar: 'ورشة جديدة في التحليل التجميعي', summary_en: 'Registration is open.', summary_ar: 'التسجيل مفتوح.',
        body_en: 'Join our hands-on meta-analysis workshop.', body_ar: 'انضم إلى ورشتنا العملية في التحليل التجميعي.', image: '', author_name: '', published_at: '2026-09-20', ...pub },
    ],
    team: [
      { _id: 'dr-sara-ahmed', slug: 'dr-sara-ahmed', group: 'team', name_en: 'Dr Sara Ahmed', name_ar: 'د. سارة أحمد', role_en: 'Lead statistician', role_ar: 'كبيرة الإحصائيين',
        affiliation_en: 'SiaNexis', affiliation_ar: 'SiaNexis', bio_en: 'Statistician with a focus on meta-analysis.', bio_ar: 'إحصائية متخصصة في التحليل التجميعي.', photo: '',
        profile_url: '', orcid: '0000-0002-1825-0097', google_scholar_url: '', publications: [], ...pub },
      { _id: 'prof-john-smith', slug: 'prof-john-smith', group: 'advisory', name_en: 'Prof John Smith', name_ar: 'أ.د. جون سميث', role_en: 'Advisor', role_ar: 'مستشار',
        affiliation_en: 'University of Oxford', affiliation_ar: 'جامعة أكسفورد', bio_en: '', bio_ar: '', photo: '', profile_url: '', orcid: '', google_scholar_url: '', publications: [], ...pub },
    ],
    collaborations: [
      { _id: 'collab-1', organization_name_en: 'Cairo University Hospitals', organization_name_ar: 'مستشفيات جامعة القاهرة', country_en: 'Egypt', country_ar: 'مصر', collaboration_type: 'hospital',
        description_en: 'Multicenter clinical studies.', description_ar: 'دراسات سريرية متعددة المراكز.', logo: '', link: 'https://cu.edu.eg', latitude: 30.03, longitude: 31.21, ...pub },
      { _id: 'collab-2', organization_name_en: 'LSHTM', organization_name_ar: 'كلية لندن للصحة', country_en: 'United Kingdom', country_ar: 'المملكة المتحدة', collaboration_type: 'academic',
        description_en: 'Global mental health research.', description_ar: 'بحوث الصحة النفسية العالمية.', logo: '', link: '', latitude: 51.52, longitude: -0.13, ...pub },
    ],
    hub: [
      { _id: 'celiac-network', slug: 'celiac-network', category: 'network', title_en: 'Gut-brain research network', title_ar: 'شبكة أبحاث المحور المعوي الدماغي', summary_en: 'A network of clinicians and statisticians.',
        summary_ar: 'شبكة من الأطباء والإحصائيين.', description_en: 'We connect teams studying the gut-brain axis.', description_ar: 'نربط الفرق التي تدرس المحور المعوي الدماغي.',
        research_area: 'psychiatry', status: 'recruiting', image: '', link: '', related_project: 'celiac-mental-health', ...pub },
      { _id: 'multicenter-sleep', slug: 'multicenter-sleep', category: 'multicenter', title_en: 'Multicenter sleep study', title_ar: 'دراسة النوم متعددة المراكز', summary_en: 'Recruiting sites.', summary_ar: 'نبحث عن مراكز.',
        description_en: '', description_ar: '', research_area: '', status: 'planned', image: '', link: '', related_project: '', ...pub },
    ],
    opportunities: [
      { _id: 'student-internship', slug: 'student-internship', kind: 'student', title_en: 'Research internship', title_ar: 'تدريب بحثي', summary_en: 'For medical students.', summary_ar: 'لطلاب الطب.',
        description_en: 'Work with our team for three months.', description_ar: 'اعمل مع فريقنا لمدة ثلاثة أشهر.', deadline: '2026-12-31', apply_link: '', ...pub },
    ],
    metrics: [
      { _id: 'm1', label_en: 'Studies supported', label_ar: 'دراسات مدعومة', value: 24, suffix: '+', ...pub },
      { _id: 'm2', label_en: 'Countries', label_ar: 'دول', value: 9, suffix: '', ...pub, order: 1 },
    ],
    pages: [
      { _id: 'privacy', slug: 'privacy', title_en: 'Privacy policy', title_ar: 'سياسة الخصوصية', summary_en: '', summary_ar: '', body_en: 'We respect your privacy.\n\nWe only store the details you send us.',
        body_ar: 'نحترم خصوصيتك.\n\nنحتفظ فقط بالبيانات التي ترسلها إلينا.', show_in_menu: true, meta_title_en: '', meta_title_ar: '', meta_description_en: '', meta_description_ar: '', ...pub },
    ],
    training: [
      { _id: 'meta-analysis-101', slug: 'meta-analysis-101', kind: 'course', title_en: 'Meta-analysis 101', title_ar: 'التحليل التجميعي من الصفر', summary_en: 'A hands-on course.', summary_ar: 'دورة عملية.',
        description_en: 'Learn to run a full systematic review.', description_ar: 'تعلّم تنفيذ مراجعة منهجية كاملة.', start_date: '2026-11-15', duration_en: '4 weeks', duration_ar: '4 أسابيع',
        format_en: 'Online', format_ar: 'عن بُعد', registration_link: '', registration_open: true, capacity: 2, image: '', ...pub },
    ],
  },
};
