// server.js

require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');

const config = require('./config');

const {
  getProvider
} = require('./services/llm-providers');

const {
  executeTool
} = require('./services/tool-executor');

const {
  getMemoryContext,
  addLesson
} = require('./services/memory');

const app = express();

const PORT =
  config.PORT;

// ============================================================
// Workspace
// ============================================================

const workspacePath =
  path.resolve(
    process.cwd(),
    config.WORKSPACE_DIR
  );

fs.mkdirSync(
  workspacePath,
  {
    recursive: true
  }
);

// ============================================================
// Middleware
// ============================================================

app.disable('x-powered-by');

app.use(
  express.json({
    limit: '10mb'
  })
);

app.use(
  express.urlencoded({
    limit: '10mb',
    extended: true
  })
);

// ============================================================
// System Prompt
// ============================================================

function buildSystemPrompt() {

  const memoryContext =
    getMemoryContext();

  return `
أنت OpenClaw، وكيل برمجي مستقل يعمل داخل مساحة عمل آمنة.

مهامك الأساسية:
- تحليل طلب المستخدم.
- قراءة الملفات عند الحاجة.
- إنشاء وتعديل الملفات.
- حذف الملفات عند الحاجة وبحذر.
- تشغيل أوامر التطوير المسموحة.
- استخدام Git.
- اختبار التغييرات.
- إصلاح الأخطاء.
- التفكير في خطوات المهمة قبل تنفيذها.

قواعد مهمة:

1. لا تدّعي أنك نفذت شيئاً إذا لم تستخدم الأداة فعلياً.
2. عندما تحتاج إلى معلومات من ملف، استخدم read_file.
3. عندما تحتاج إلى معرفة محتويات مجلد، استخدم list_files.
4. عند تعديل الكود، اقرأ الملف أولاً إذا كان ذلك ضرورياً لفهمه.
5. بعد تعديل مهم، استخدم أدوات الاختبار أو git عند الحاجة.
6. لا تحاول الوصول إلى ملفات خارج مساحة العمل.
7. لا تنفذ أوامر غير مسموحة.
8. لا تحذف ملفات مهمة بدون سبب واضح.
9. إذا فشلت أداة، حلل الخطأ وحاول طريقة صحيحة أخرى إذا كان ذلك آمناً.
10. لا تكرر نفس استدعاء الأداة بلا فائدة.
11. عند انتهاء المهمة، أعط المستخدم ملخصاً واضحاً لما تم فعله.
12. أجب بالعربية دائماً ما لم يطلب المستخدم لغة أخرى.

مساحة العمل:
${config.WORKSPACE_DIR}

الدروس السابقة:
${memoryContext}
`;
}

// ============================================================
// Normalize history
// ============================================================

function normalizeHistory(
  history
) {

  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(message => {

      if (!message) {
        return false;
      }

      if (
        !['user', 'assistant']
          .includes(message.role)
      ) {
        return false;
      }

      return (
        typeof message.content === 'string' &&
        message.content.trim()
      );
    })
    .slice(
      -config.MAX_HISTORY_MESSAGES
    )
    .map(message => ({
      role: message.role,
      content: message.content
    }));
}

// ============================================================
// Agent Loop
// ============================================================

async function runAgent(
  userMessage,
  chatHistory = []
) {

  if (
    typeof userMessage !== 'string' ||
    !userMessage.trim()
  ) {

    throw new Error(
      'رسالة المستخدم فارغة'
    );
  }

  const history =
    normalizeHistory(
      chatHistory
    );

  // منع تكرار الرسالة الحالية
  const last =
    history[history.length - 1];

  if (
    last?.role === 'user' &&
    last.content.trim() ===
      userMessage.trim()
  ) {

    history.pop();
  }

  const messages = [

    {
      role: 'system',
      content:
        buildSystemPrompt()
    },

    ...history,

    {
      role: 'user',
      content:
        userMessage.trim()
    }
  ];

  const provider =
    getProvider(
      config.ACTIVE_PROVIDER
    );

  let iterations =
    config.MAX_AGENT_ITERATIONS;

  let finalResponse = '';

  while (
    iterations-- > 0
  ) {

    console.log(
      `🧠 Agent iteration: ${
        config.MAX_AGENT_ITERATIONS -
        iterations
      }`
    );

    const response =
      await provider.chat(
        messages
      );

    // ========================================================
    // Tool calls
    // ========================================================

    if (
      Array.isArray(
        response.tool_calls
      ) &&
      response.tool_calls.length
    ) {

      // نضيف رسالة الموديل كما هي
      messages.push({
        role: 'assistant',

        content:
          response.content || null,

        tool_calls:
          response.tool_calls
      });

      // تنفيذ كل الأدوات المطلوبة
      for (
        const toolCall
        of response.tool_calls
      ) {

        const toolName =
          toolCall?.function?.name;

        if (!toolName) {

          messages.push({
            role: 'tool',

            tool_call_id:
              toolCall?.id ||
              'unknown',

            name:
              'unknown',

            content:
              JSON.stringify({
                error:
                  'استدعاء أداة غير صالح'
              })
          });

          continue;
        }

        let args = {};

        try {

          args =
            typeof toolCall.function.arguments ===
              'string'
              ? JSON.parse(
                  toolCall.function.arguments
                )
              : (
                  toolCall.function.arguments ||
                  {}
                );

        } catch (error) {

          console.error(
            'Tool arguments JSON error:',
            error
          );

          messages.push({
            role: 'tool',

            tool_call_id:
              toolCall.id ||
              toolName,

            name:
              toolName,

            content:
              JSON.stringify({
                error:
                  'JSON الخاص بوسائط الأداة غير صالح'
              })
          });

          continue;
        }

        console.log(
          `🔧 تنفيذ: ${toolName}`,
          args
        );

        const result =
          await executeTool(
            toolName,
            args
          );

        const toolPayload =
          result.success
            ? {
                success: true,
                output:
                  result.output || ''
              }
            : {
                success: false,
                error:
                  result.error ||
                  'فشل تنفيذ الأداة'
              };

        // رسالة موحدة تصلح لـ DeepSeek/Ollama
        // ونعيد تحويلها إلى functionResponse داخل GeminiProvider
        messages.push({
          role: 'tool',

          tool_call_id:
            toolCall.id ||
            toolName,

          name:
            toolName,

          content:
            JSON.stringify(
              toolPayload
            )
        });

        if (!result.success) {

          addLesson(
            `فشل استدعاء الأداة ${toolName}`,
            result.error
          );
        }
      }

      // نعود إلى النموذج ليحلل نتائج الأدوات
      continue;
    }

    // ========================================================
    // Final answer
    // ========================================================

    if (
      typeof response.content === 'string' &&
      response.content.trim()
    ) {

      finalResponse =
        response.content.trim();

      messages.push({
        role: 'assistant',

        content:
          finalResponse
      });

      break;
    }

    // ========================================================
    // Unknown response
    // ========================================================

    finalResponse =
      'لم يرجع النموذج استجابة مفهومة.';

    break;
  }

  // ==========================================================
  // Iteration limit
  // ==========================================================

  if (!finalResponse) {

    finalResponse =
      '⏳ وصل الوكيل إلى الحد الأقصى لخطوات التنفيذ. ' +
      'راجع المهمة أو اطلب منه متابعة العمل.';
  }

  return {
    response:
      finalResponse,

    messages
  };
}

// ============================================================
// Health
// ============================================================

app.get(
  '/api/health',
  (req, res) => {

    res.json({
      success: true,

      provider:
        config.ACTIVE_PROVIDER,

      model:
        config.ACTIVE_PROVIDER === 'gemini'
          ? config.GEMINI_MODEL
          : config.ACTIVE_PROVIDER === 'deepseek'
            ? config.DEEPSEEK_MODEL
            : config.OLLAMA_MODEL,

      workspace:
        config.WORKSPACE_DIR,

      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// Chat
// ============================================================

app.post(
  '/api/chat',
  async (req, res) => {

    const {
      prompt,
      history = []
    } = req.body || {};

    if (
      typeof prompt !== 'string' ||
      !prompt.trim()
    ) {

      return res.status(400).json({
        success: false,

        response:
          'الرسالة مطلوبة'
      });
    }

    try {

      const result =
        await runAgent(
          prompt,
          history
        );

      return res.json({
        success: true,

        response:
          result.response
      });

    } catch (error) {

      console.error(
        '❌ Agent error:',
        error
      );

      return res.status(500).json({

        success: false,

        response:
          `⚠️ ${error.message}`
      });
    }
  }
);

// ============================================================
// Provider switch
// ============================================================

app.post(
  '/api/switch',
  (req, res) => {

    const {
      provider
    } = req.body || {};

    if (
      !['gemini', 'deepseek', 'ollama']
        .includes(provider)
    ) {

      return res.status(400).json({

        success: false,

        error:
          'موفر غير صالح'
      });
    }

    config.ACTIVE_PROVIDER =
      provider;

    return res.json({

      success: true,

      provider,

      message:
        `تم التبديل إلى ${provider}`
    });
  }
);

// ============================================================
// Web UI
// ============================================================

app.get(
  '/',
  (req, res) => {

    const provider =
      config.ACTIVE_PROVIDER;

    res.send(`
<!DOCTYPE html>

<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
/>

<title>OpenClaw Agent</title>

<script src="https://cdn.tailwindcss.com"></script>

<style>

body {
  background: #0b0d12;
  color: #f3f4f6;
  font-family: Arial, sans-serif;
}

.glass {
  background: rgba(25, 28, 38, .82);
  border: 1px solid #272b36;
  backdrop-filter: blur(12px);
}

.message {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.typing span {
  animation: blink 1.2s infinite;
}

.typing span:nth-child(2) {
  animation-delay: .2s;
}

.typing span:nth-child(3) {
  animation-delay: .4s;
}

@keyframes blink {
  0%,100% {
    opacity: .2;
  }

  50% {
    opacity: 1;
  }
}

</style>

</head>

<body class="min-h-screen">

<div class="max-w-4xl mx-auto min-h-screen flex flex-col p-3">

<header
  class="flex justify-between items-center
         border-b border-neutral-800
         pb-3 mb-3"
>

<div class="flex items-center gap-3">

<div
  class="w-10 h-10 rounded-xl
         bg-emerald-600
         flex items-center justify-center
         font-black"
>
OC
</div>

<div>

<h1 class="font-bold text-lg">
OpenClaw
</h1>

<div class="text-xs text-neutral-500">
Autonomous Agent
</div>

</div>

</div>

<div class="flex items-center gap-2">

<select
  id="provider"
  class="bg-neutral-900
         border border-neutral-700
         rounded-lg px-2 py-2 text-sm"
  onchange="switchProvider(this.value)"
>

<option
 value="gemini"
 ${provider === 'gemini' ? 'selected' : ''}
>
Gemini
</option>

<option
 value="deepseek"
 ${provider === 'deepseek' ? 'selected' : ''}
>
DeepSeek
</option>

<option
 value="ollama"
 ${provider === 'ollama' ? 'selected' : ''}
>
Ollama
</option>

</select>

</div>

</header>

<main
  id="chat"
  class="flex-1 overflow-y-auto space-y-4 pb-4"
></main>

<div
  id="status"
  class="hidden mb-2
         glass rounded-xl
         px-3 py-2 text-xs
         text-emerald-400"
>
جاري التنفيذ...
</div>

<div
  class="glass rounded-2xl p-3
         flex items-end gap-2"
>

<textarea
  id="input"
  rows="1"
  placeholder="اكتب طلبك..."
  class="flex-1 bg-transparent
         outline-none resize-none
         max-h-40"
></textarea>

<button
  id="send"
  onclick="sendMessage()"
  class="bg-emerald-600
         hover:bg-emerald-700
         px-4 py-3
         rounded-xl"
>
إرسال
</button>

</div>

</div>

<script>

const chat =
  document.getElementById('chat');

const input =
  document.getElementById('input');

const status =
  document.getElementById('status');

const sendButton =
  document.getElementById('send');

let chatHistory = [];

function addMessage(
  role,
  text
) {

  const wrapper =
    document.createElement('div');

  wrapper.className =
    role === 'user'
      ? 'flex justify-start'
      : 'flex justify-end';

  const bubble =
    document.createElement('div');

  bubble.className =
    role === 'user'
      ? 'bg-emerald-700 rounded-2xl p-3 max-w-[85%] message'
      : 'glass rounded-2xl p-3 max-w-[85%] message';

  bubble.textContent =
    text;

  wrapper.appendChild(
    bubble
  );

  chat.appendChild(
    wrapper
  );

  chat.scrollTop =
    chat.scrollHeight;
}

function setStatus(
  text,
  visible = true
) {

  status.textContent =
    text;

  status.classList.toggle(
    'hidden',
    !visible
  );
}

async function sendMessage() {

  const text =
    input.value.trim();

  if (!text) {
    return;
  }

  input.value = '';

  input.style.height =
    'auto';

  addMessage(
    'user',
    text
  );

  // لا نضيف user هنا.
  // السيرفر هو الذي يضيف الرسالة الحالية.

  sendButton.disabled =
    true;

  input.disabled =
    true;

  setStatus(
    '🧠 الوكيل يعمل...'
  );

  try {

    const response =
      await fetch(
        '/api/chat',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              prompt: text,
              history: chatHistory
            })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.response ||
        data.error ||
        'حدث خطأ'
      );
    }

    addMessage(
      'assistant',
      data.response
    );

    chatHistory.push({
      role: 'user',
      content: text
    });

    chatHistory.push({
      role: 'assistant',
      content: data.response
    });

    if (
      chatHistory.length > 30
    ) {

      chatHistory =
        chatHistory.slice(-30);
    }

  } catch (error) {

    addMessage(
      'assistant',
      '⚠️ ' +
      error.message
    );

  } finally {

    sendButton.disabled =
      false;

    input.disabled =
      false;

    input.focus();

    setStatus(
      '',
      false
    );
  }
}

async function switchProvider(
  provider
) {

  setStatus(
    '🔄 جاري تبديل النموذج...'
  );

  try {

    const response =
      await fetch(
        '/api/switch',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              provider
            })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        'فشل التبديل'
      );
    }

    addMessage(
      'assistant',
      '✅ تم التبديل إلى ' +
      provider
    );

  } catch (error) {

    addMessage(
      'assistant',
      '⚠️ ' +
      error.message
    );

  } finally {

    setStatus(
      '',
      false
    );
  }
}

input.addEventListener(
  'keydown',
  event => {

    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {

      event.preventDefault();

      sendMessage();
    }
  }
);

input.addEventListener(
  'input',
  () => {

    input.style.height =
      'auto';

    input.style.height =
      Math.min(
        input.scrollHeight,
        160
      ) + 'px';
  }
);

addMessage(
  'assistant',
  '👋 أهلاً بك. أنا OpenClaw.\\n\\n' +
  'أستطيع قراءة الملفات وتعديلها وتشغيل أدوات التطوير المسموحة.'
);

</script>

</body>

</html>
`);
  }
);

// ============================================================
// Error handler
// ============================================================

app.use(
  (error, req, res, next) => {

    console.error(
      'Unhandled error:',
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({

      success: false,

      error:
        'خطأ داخلي في السيرفر'
    });
  }
);

// ============================================================
// Start
// ============================================================

app.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log('');
    console.log(
      '======================================'
    );

    console.log(
      '🔥 OpenClaw Agent'
    );

    console.log(
      `🌐 Port: ${PORT}`
    );

    console.log(
      `🧠 Provider: ${config.ACTIVE_PROVIDER}`
    );

    console.log(
      `📂 Workspace: ${config.WORKSPACE_DIR}`
    );

    console.log(
      '======================================'
    );

    console.log('');
  }
);
