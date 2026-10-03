# SiaNexis على Firebase (خطة Spark المجانية) — دليل التشغيل

الموقع هنا **تطبيق JavaScript واحد (SPA)** بدون أي سيرفر. كل الأمان بيتفرض من **قواعد Firestore** (`firestore.rules`)، وده مولَّد من `src/schema.js` عن طريق `tools/gen_rules.mjs`.

| الجزء | الخدمة | التكلفة |
|---|---|---|
| الموقع (HTML/JS) | Firebase Hosting | مجاني (Spark) |
| البيانات | Cloud Firestore | مجاني حتى 50 ألف قراءة و20 ألف كتابة يوميًا |
| الدخول (طلاب + فريق) | Firebase Authentication (بريد/كلمة مرور + Google) | مجاني |
| الصور وملفات PDF للمقالات | Cloudinary (الخطة المجانية) | مجاني بدون بطاقة |
| ملفات الطلاب الخاصة | داخل Firestore (مقسّمة، حد أقصى 4 ميجا للطالب و10 للفريق) | مجاني |

> مفيش Cloud Functions ولا Storage (بيحتاجوا Blaze) — لذلك مفيش أي خطوة محتاجة بطاقة.

## 1) إنشاء المشروع (مرة واحدة)
1. من [console.firebase.google.com](https://console.firebase.google.com) أنشئ مشروع (اتركه على Spark).
2. **Build → Firestore Database → Create database** (production mode، أي منطقة قريبة).
3. **Build → Authentication → Get started** وفعّل **Email/Password** و**Google**.
   وفي **Authentication → Settings → Authorized domains** أضف دومين موقعك لو ربطت دومين خاص.
4. **Project settings → Your apps → Web (</>)**: انسخ قيم `apiKey`, `authDomain`, `projectId`, `appId`.
5. من Cloudinary (حساب مجاني): **Settings → Upload → Add upload preset** واختر **Signing mode: Unsigned**، وسجّل اسم الـcloud والـpreset.
   (لو عايز ملفات PDF تتحمّل للزوار: Settings → Security → فعّل *PDF and ZIP files delivery*.)

## 2) إعداد الكود
```bash
cd web
npm install
cp .env.example .env.production      # املأ القيم من الخطوتين 4 و5
```

## 3) النشر
```bash
npx firebase login
npx firebase use --add               # اختر مشروعك
npm run deploy                       # build + hosting + قواعد Firestore + الفهارس
```
أول مرة قد يطلب Firebase إنشاء الفهارس (`firestore.indexes.json`)؛ النشر بيعملها تلقائيًا (دقيقة أو اتنين).

## 4) أول مدير للموقع
الأمان مقصود إن مفيش حد يقدر يعيّن نفسه مديرًا من الموقع. أول مدير بتعمله يدويًا مرة واحدة:
1. افتح `https://موقعك/admin/` وسجّل حساب جديد (أو ادخل بـGoogle) ثم أكّد بريدك واضغط **Request staff access**.
2. في Firebase Console → Firestore → collection **admins** → **Add document** بالـ**Document ID = UID الحساب** (تلاقيه في Authentication → Users) والحقول:
   - `role` (string) = `admin`
   - `email` (string) = بريدك
3. حدّث صفحة `/admin/` — هتدخل لوحة التحكم. باقي الفريق بيطلبوا الصلاحية بنفس الطريقة وإنت بتوافق عليهم من **Users & access → Staff access** وتحدد الدور (admin / editor / contributor).

الأدوار: **admin** كل شيء • **editor** كل المحتوى والإعدادات والاستيراد • **contributor** إضافة وتعديل فقط (بدون حذف أو إعدادات).

## 5) نقل المحتوى من موقع Django القديم
```bash
# على الجهاز اللي عليه Django:
python manage.py export_firebase > export.json
```
ثم من لوحة الإدارة: **Users & access → Backup & import → Import data** وارفع الملف. بعدها اضغط **Rebuild public data** لو لزم.
أو **Load sample content** لو عايز محتوى تجريبي.
(الصور القديمة بتفضل مرتبطة بمسارها القديم؛ ارفعها على Cloudinary وحدّث الحقول، أو أبقِ موقع Django القديم شغالًا لملفات الميديا.)

## 6) الصور وملفات PDF
من **Site settings** حط `Cloudinary cloud` و`Cloudinary preset`. بعدها كل زر Upload في اللوحة بيرفع على Cloudinary، والموقع بيعرض الصور مضغوطة تلقائيًا (`f_auto,q_auto`).

## 7) استيراد مقال من PDF
**Publications → Import article from PDF** (أو من الداشبورد): اختر الـPDF واضغط **Publish now** أو **Save as draft**. القراءة بتحصل في متصفحك (pdf.js) وبعدين بيكمّل البيانات من Crossref لو فيه DOI، ويرفع الـPDF والصور على Cloudinary، ويعرض لك ملاحظات للمراجعة (جداول معقدة، عدد صور مختلف…). لو الورقة موجودة بنفس الـDOI بيسألك قبل الاستبدال.

## 8) السيو
الموقع بيرسم الصفحات في المتصفح (جوجل بينفّذ JavaScript)، والعناوين والـmeta والـJSON-LD بتتحدّث لكل صفحة.
```bash
VITE_SITE_URL=https://موقعك npm run sitemap   # يكتب public/sitemap.xml و robots.txt من المحتوى المنشور
npm run deploy
```

## 9) الاختبارات
```bash
npm run emulators            # Auth + Firestore محليًا (نافذة منفصلة)
npm run dev                  # الموقع على http://127.0.0.1:5173 مع VITE_USE_EMULATORS=1
npm run test:unit            # استخراج الـPDF، Crossref، الصور
npm run test:rules           # قواعد الأمان (يشغّل المحاكي بنفسه)
npm run test:e2e             # المتصفح: الموقع العام، لوحة الإدارة، بوابة الطلاب، استيراد PDF
```
(الـe2e بيحتاج Chromium؛ تقدر تحدد مساره بـ`CHROMIUM=/path/to/chromium`.)

## ما الذي تغيّر مقارنة بنسخة Django (بصراحة)
- **مفيش رسائل بريد من الموقع**: الإشعارات داخل الموقع (جرس الطالب) + رسائل Firebase Auth الرسمية (تأكيد البريد وإعادة كلمة المرور). التواصل مع طالب بيتم بالرد اليدوي.
- **مفيش Webhooks لـCRM ولا REST API ولا rate-limit بالـIP**: بدل كده فيه حدود في القواعد (فحص حجم/شكل البيانات، معرّفات تمنع التكرار، عدّاد مقاعد التدريب) وحقل honeypot + تأخير بسيط في النماذج.
- **الجدولة (publish_at / unpublish_at)** بتتطبّق في المتصفح؛ الزائر المتمكن تقنيًا يقدر يقرأ عنصر مجدول لسه ما نُشرش من الـAPI. لا تضع أسرارًا في مسودات مجدولة.
- **ملفات الطلاب الخاصة** تتخزن في Firestore (4 ميجا للطالب / 10 للفريق) أو كرابط خارجي للملفات الأكبر.
- **حدود Spark**: لو الزيارات كبرت لدرجة تعدّي الحد اليومي لقراءات Firestore، الموقع بيقلل القراءات بنسخ مجمّعة (snapshots) + كاش 2 دقيقة، وبعدها ممكن الترقية لاحقًا بدون تغيير الكود.
- لم يُجرَّب على مشروع Firebase حقيقي من داخل بيئة التطوير (كل الاختبارات على المحاكيات) — اعمل أول نشر تجريبي وراجع الخطوات 3 و4 مرة.
