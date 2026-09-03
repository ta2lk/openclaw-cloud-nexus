# OpenClaw Cloud Nexus - دليل التثبيت والتشغيل

## 📥 خطوات التثبيت

```bash
# 1. استنساخ المشروع
git clone https://github.com/ta2lk/openclaw-cloud-nexus.git
cd openclaw-cloud-nexus

# 2. تثبيت الاعتماديات
npm install

# 3. نسخ ملف البيئة
cp .env.example .env

# 4. تشغيل السيرفر
npm start
```

## 🌍 الوصول للسيرفر

افتح المتصفح وانتقل إلى: `http://localhost:3000`

## 📝 ملاحظات مهمة

- السيرفر ينشئ المجلدات `workspace/` و `skills/` تلقائياً
- جميع الملفات المُنشأة تُحفظ محلياً على السيرفر
- يمكن تغيير المنفذ من خلال متغير البيئة `PORT`

## 🚀 جاهز للاستخدام

المشروع الآن جاهز بالكامل!