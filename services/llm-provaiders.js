// services/llm-providers.js
const axios = require('axios');
const config = require('../config');

// --- تعريف موحد للأدوات (JSON Schema) ---
const TOOL_DEFINITIONS = [
  {
    name: 'read_file',
    description: 'قراءة محتوى ملف داخل مساحة العمل',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'مسار الملف النسبي' } }, required: ['path'] }
  },
  {
    name: 'write_file',
    description: 'كتابة أو تعديل ملف داخل مساحة العمل',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }
  },
  {
    name: 'delete_file',
    description: 'حذف ملف من مساحة العمل',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    name: 'list_files',
    description: 'عرض محتويات مجلد داخل مساحة العمل',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'مسار المجلد (اختياري)' } } }
  },
  {
    name: 'run_command',
    description: 'تشغيل أوامر تطوير مسموحة (npm run, git status/diff, node, ls, cat)',
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'الأمر الكامل' } }, required: ['command'] }
  },
  {
    name: 'git_commit',
    description: 'تنفيذ git commit مع رسالة',
    parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] }
  },
  {
    name: 'git_status_diff',
    description: 'الحصول على حالة git أو الفرق بين التغييرات',
    parameters: { type: 'object', properties: { type: { type: 'string', enum: ['status', 'diff'] } }, required: ['type'] }
  }
];

// --- الفئة الأساسية ---
class BaseProvider {
  constructor() { this.tools = TOOL_DEFINITIONS; }

  // يجب أن تُعيد تنفيذها الفئات الفرعية
  async chat(messages) {
    throw new Error('يجب تنفيذ chat() في الفئة الفرعية');
  }

  // تحويل تنسيق الأدوات الموحد إلى تنسيق Gemini
  toGeminiTools() {
    return {
      functionDeclarations: this.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    };
  }

  // تحويل إلى تنسيق OpenAI (DeepSeek / Ollama)
  toOpenAITools() {
    return this.tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }
}

// --- موفّر Gemini ---
class GeminiProvider extends BaseProvider {
  async chat(messages) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;
    // تحويل تنسيق المحادثة إلى تنسيق Gemini
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }]
    }));

    const payload = {
      contents,
      tools: [this.toGeminiTools()],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } }
    };

    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
    const candidate = res.data.candidates[0];
    const part = candidate?.content?.parts?.[0];
    const functionCall = part?.functionCall;

    if (functionCall) {
      return {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: functionCall.name, function: { name: functionCall.name, arguments: JSON.stringify(functionCall.args) } }]
      };
    }
    return { role: 'assistant', content: part?.text || 'عذراً، لم أتلق رداً.' };
  }
}

// --- موفّر DeepSeek (متوافق مع OpenAI) ---
class DeepSeekProvider extends BaseProvider {
  async chat(messages) {
    const url = 'https://api.deepseek.com/v1/chat/completions';
    const payload = {
      model: config.DEEPSEEK_MODEL,
      messages,
      tools: this.toOpenAITools(),
      tool_choice: 'auto'
    };
    const res = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.DEEPSEEK_API_KEY}`
      }
    });
    const choice = res.data.choices[0];
    const message = choice.message;
    if (message.tool_calls) {
      return { role: 'assistant', content: null, tool_calls: message.tool_calls };
    }
    return { role: 'assistant', content: message.content };
  }
}

// --- موفّر Ollama (يدعم الأدوات أيضاً) ---
class OllamaProvider extends BaseProvider {
  async chat(messages) {
    const url = `${config.OLLAMA_BASE_URL}/api/chat`;
    // نظام Ollama: tools بتنسيق OpenAI نفسه
    const payload = {
      model: config.OLLAMA_MODEL,
      messages,
      tools: this.toOpenAITools(),
      stream: false
    };
    const res = await axios.post(url, payload);
    const message = res.data.message;
    if (message.tool_calls) {
      return { role: 'assistant', content: null, tool_calls: message.tool_calls };
    }
    return { role: 'assistant', content: message.content };
  }
}

// --- المصنع ---
function getProvider(name) {
  switch (name) {
    case 'gemini': return new GeminiProvider();
    case 'deepseek': return new DeepSeekProvider();
    case 'ollama': return new OllamaProvider();
    default: throw new Error(`موفر غير معروف: ${name}`);
  }
}

module.exports = { getProvider, TOOL_DEFINITIONS };
