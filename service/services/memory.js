// services/memory.js
const fs = require('fs');
const path = require('path');
const { WORKSPACE } = require('./tool-executor');

const MEMORY_FILE = path.join(WORKSPACE, '.openclaw_memory.json');

// تحميل الذاكرة أو إنشاؤها
function loadMemory() {
  if (fs.existsSync(MEMORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
    } catch { return { lessons: [] }; }
  }
  return { lessons: [] };
}

function saveMemory(data) {
  fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}

// إضافة درس جديد (مثال: خطأ تم حله، أو نمط برمجي)
function addLesson(summary, details) {
  const mem = loadMemory();
  mem.lessons.push({ timestamp: new Date().toISOString(), summary, details });
  if (mem.lessons.length > 50) mem.lessons.shift(); // حد أقصى للذاكرة
  saveMemory(mem);
}

// استرجاع سياق الذاكرة لإضافته إلى النظام
function getMemoryContext() {
  const mem = loadMemory();
  if (mem.lessons.length === 0) return 'لا توجد دروس مسجلة بعد.';
  return mem.lessons.slice(-5).map(l => `- ${l.summary}: ${l.details}`).join('\n');
}

module.exports = { addLesson, getMemoryContext, loadMemory };
