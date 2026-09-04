// server.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getProvider } = require('./services/llm-providers');
const { executeTool } = require('./services/tool-executor');
const { getMemoryContext, addLesson } = require('./services/memory');

const app = express();
const PORT = process.env.PORT || 3000;

// تأكد من وجود مجلد workspace
if (!fs.existsSync(config.WORKSPACE_DIR)) {
  fs.mkdirSync(config.WORKSPACE_DIR, { recursive: true });
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================================
// 🧠 حلقة الوكيل الأساسية (Agent Loop)
// ============================================================
async function runAgent(userMessage, chatHistory = []) {
  // 1. بناء رسالة النظام مع الأدوات والذاكرة
  const memoryContext = getMemoryContext();
  const systemPrompt = `
أنت وكيل برمجي خارق يعمل داخل نظام OpenClaw.
- مساحة العمل هي: ${config.WORKSPACE_DIR}
- يمكنك استخدام الأدوات التالية: قراءة/كتابة/حذف ملفات، عرض الملفات، تشغيل أوامر مسموحة (npm run, git status/diff, commit, ls, cat).
- التعليمات الأمنية: لا تخرج عن مساحة العمل، ولا تشغل أوامر غير مسموحة.
- استخدم الأدوات فقط عند الحاجة.
- الذاكرة التشغيلية (الدروس المستفادة):
${memoryContext}

أجب باللغة العربية دائماً، وكن دقيقاً ومفيداً.
`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: userMessage }
  ];

  let provider = getProvider(config.ACTIVE_PROVIDER);
  let maxIterations = 5;
  let finalResponse = '';

  while (maxIterations-- > 0) {
    // 2. استدعاء النموذج
    const response = await provider.chat(messages);

    if (response.content) {
      // رد نهائي
      finalResponse = response.content;
      messages.push({ role: 'assistant', content: response.content });

      // تسجيل درس إذا كان الرد يتضمن معلومة برمجية مفيدة (تبسيط)
      if (finalResponse.includes('درس') || finalResponse.includes('تعلم')) {
        addLesson('درس جديد من المحادثة', finalResponse.substring(0, 100));
      }
      break;
    }

    // 3. وجود طلب استدعاء أداة
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolCall = response.tool_calls[0];
      const toolName = toolCall.function.name;
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {}

      // تنفيذ الأداة فعلياً
      const result = await executeTool(toolName, args);

      // إضافة استدعاء الأداة ونتيجتها إلى سجل المحادثة
      const toolResultMessage = {
        role: 'tool',
        tool_call_id: toolCall.id || toolName,
        content: result.success ? result.output : `❌ خطأ: ${result.error}`
      };
      messages.push({ role: 'assistant', content: null, tool_calls: response.tool_calls });
      messages.push(toolResultMessage);

      // إذا فشلت الأداة، نسجل الدرس
      if (!result.success) {
        addLesson(`فشل استدعاء ${toolName}`, result.error);
      }
    } else {
      // حالة نادرة
      finalResponse = 'عذراً، لم أفهم الرد. حاول مرة أخرى.';
      break;
    }
  }

  if (!finalResponse) {
    finalResponse = '⏳ انتهى وقت المعالجة. حاول مرة أخرى.';
  }

  return { response: finalResponse, messages };
}

// ============================================================
// 🌐 واجهة برمجة التطبيقات (API)
// ============================================================

// نقطة الدردشة الرئيسية
app.post('/api/chat', async (req, res) => {
  const { prompt, history = [] } = req.body;
  if (!prompt) return res.status(400).json({ error: 'الرسالة مطلوبة' });

  try {
    const result = await runAgent(prompt, history);
    res.json({ success: true, response: result.response });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, response: `⚠️ خطأ في السيرفر: ${err.message}` });
  }
});

// تبديل النموذج ديناميكياً
app.post('/api/switch', (req, res) => {
  const { provider } = req.body;
  if (!['gemini', 'deepseek', 'ollama'].includes(provider)) {
    return res.status(400).json({ error: 'موفر غير صالح' });
  }
  config.ACTIVE_PROVIDER = provider;
  res.json({ success: true, message: `✅ تم التبديل إلى ${provider}` });
});

// ============================================================
// 🖥️ واجهة المستخدم (HTML/CSS/JS) - متجاوبة مع الهاتف
// ============================================================
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.5">
  <title>OpenClaw Agent</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
  <style>
    body { background: #0f0f13; color: #e4e4ef; font-family: 'Cairo', sans-serif; }
    .glass { background: rgba(30, 30, 40, 0.7); backdrop-filter: blur(4px); border: 1px solid #2a2a35; }
    .step-log { background: #1a1a22; border-radius: 12px; padding: 6px 12px; font-size: 12px; color: #9ca3af; }
    .step-log span { color: #34d399; }
    #chatContainer { scroll-behavior: smooth; }
    .typing-indicator span { display: inline-block; animation: blink 1.4s infinite; }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0% { opacity: 0.2; } 50% { opacity: 1; } 100% { opacity: 0.2; } }
  </style>
</head>
<body class="min-h-screen flex flex-col max-w-2xl mx-auto p-3">

  <header class="flex justify-between items-center py-3 border-b border-neutral-800">
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-sm font-black">OC</div>
      <h1 class="text-lg font-bold">OpenClaw <span class="text-emerald-400 text-sm">Agent</span></h1>
    </div>
    <div class="flex items-center gap-2 text-xs bg-neutral-800 px-3 py-1.5 rounded-full">
      <span id="currentProvider">${config.ACTIVE_PROVIDER}</span>
      <select id="providerSelect" onchange="switchProvider(this.value)" class="bg-transparent border border-neutral-600 rounded px-1 text-white outline-none">
        <option value="gemini" ${config.ACTIVE_PROVIDER === 'gemini' ? 'selected' : ''}>Gemini</option>
        <option value="deepseek" ${config.ACTIVE_PROVIDER === 'deepseek' ? 'selected' : ''}>DeepSeek</option>
        <option value="ollama" ${config.ACTIVE_PROVIDER === 'ollama' ? 'selected' : ''}>Ollama</option>
      </select>
    </div>
  </header>

  <main class="flex-1 flex flex-col h-[calc(100vh-130px)] mt-3">
    <div id="chatContainer" class="flex-1 overflow-y-auto space-y-4 p-2 pb-4">
      <div class="flex gap-3 items-start">
        <div class="w-8 h-8 rounded-full bg-emerald-600 flex shrink-0 items-center justify-center text-xs font-bold">AI</div>
        <div class="glass p-3 rounded-2xl text-sm max-w-[85%] leading-relaxed">
          👋 أهلاً! أنا وكيل OpenClaw الذكي.<br>
          استخدم الأدوات لقراءة/كتابة الملفات، تشغيل الأوامر، وإدارة Git.<br>
          <span class="text-neutral-400 text-[10px]">(النموذج النشط: ${config.ACTIVE_PROVIDER})</span>
        </div>
      </div>
    </div>

    <!-- منطقة عرض الخطوات (تظهر أثناء التنفيذ) -->
    <div id="stepLog" class="step-log mb-2 hidden">
      ⚡ <span id="stepText">جاري التنفيذ...</span>
    </div>

    <div class="glass p-3 rounded-2xl flex gap-2 items-end">
      <textarea id="userInput" rows="1" placeholder="اكتب طلبك..." 
        class="flex-1 bg-transparent border-0 outline-none resize-none text-sm max-h-28 placeholder-neutral-500"
        onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); sendMessage();}"></textarea>
      <button onclick="sendMessage()" class="bg-emerald-600 hover:bg-emerald-700 p-2.5 rounded-xl transition text-white">
        <svg class="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  </main>

  <script>
    let chatHistory = [];
    const container = document.getElementById('chatContainer');
    const stepLog = document.getElementById('stepLog');
    const stepText = document.getElementById('stepText');

    function addMessage(role, content, isHtml = false) {
      const div = document.createElement('div');
      div.className = \`flex gap-3 items-start \${role === 'user' ? 'justify-end' : ''}\`;
      const avatar = role === 'user' ? '🧑' : '🤖';
      const bg = role === 'user' ? 'bg-neutral-700' : 'glass';
      const align = role === 'user' ? 'order-2' : '';
      div.innerHTML = \`
        <div class="w-8 h-8 rounded-full \${bg} flex shrink-0 items-center justify-center text-sm font-bold order-1">\${avatar}</div>
        <div class="\${bg} p-3 rounded-2xl text-sm max-w-[85%] leading-relaxed order-2 whitespace-pre-line">
          \${isHtml ? content : content.replace(/\\n/g, '<br>')}
        </div>
      \`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function showStep(text) {
      stepLog.classList.remove('hidden');
      stepText.textContent = text;
    }

    function hideStep() {
      stepLog.classList.add('hidden');
    }

    async function sendMessage() {
      const input = document.getElementById('userInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.style.height = 'auto';

      addMessage('user', text);
      chatHistory.push({ role: 'user', content: text });

      // مؤقت انتظار
      const tempDiv = document.createElement('div');
      tempDiv.className = 'flex gap-3 items-start';
      tempDiv.innerHTML = \`
        <div class="w-8 h-8 rounded-full bg-emerald-600 flex shrink-0 items-center justify-center text-sm font-bold">AI</div>
        <div class="glass p-3 rounded-2xl text-sm">
          <span class="typing-indicator flex gap-1"><span>.</span><span>.</span><span>.</span></span>
        </div>
      \`;
      container.appendChild(tempDiv);
      container.scrollTop = container.scrollHeight;

      try {
        showStep('🧠 النموذج يفكر...');
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, history: chatHistory })
        });
        const data = await res.json();
        hideStep();

        // إزالة مؤقت الانتظار
        tempDiv.remove();

        if (data.success) {
          chatHistory.push({ role: 'assistant', content: data.response });
          addMessage('assistant', data.response);
        } else {
          addMessage('assistant', '❌ ' + data.response);
        }
      } catch (err) {
        tempDiv.remove();
        addMessage('assistant', '⚠️ فشل الاتصال بالسيرفر: ' + err.message);
      }
    }

    async function switchProvider(provider) {
      try {
        showStep('🔄 جاري التبديل إلى ' + provider);
        const res = await fetch('/api/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider })
        });
        const data = await res.json();
        hideStep();
        if (data.success) {
          document.getElementById('currentProvider').textContent = provider;
          addMessage('assistant', '✅ تم التبديل إلى النموذج: ' + provider);
        } else {
          addMessage('assistant', '❌ فشل التبديل: ' + data.error);
        }
      } catch (err) {
        hideStep();
        addMessage('assistant', '⚠️ خطأ في التبديل: ' + err.message);
      }
    }

    // auto-resize
    const ta = document.getElementById('userInput');
    ta.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
    });
  </script>
</body>
</html>
  `);
});

// ============================================================
// 🚀 تشغيل السيرفر
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 OpenClaw Agent running on port ${PORT}`);
  console.log(`🧠 النموذج النشط: ${config.ACTIVE_PROVIDER}`);
  console.log(`📂 مساحة العمل: ${config.WORKSPACE_DIR}`);
});
