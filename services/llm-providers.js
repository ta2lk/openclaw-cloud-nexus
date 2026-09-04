const axios = require('axios');
const config = require('../config');

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

class BaseProvider {
  constructor() { this.tools = TOOL_DEFINITIONS; }
  async chat(messages) { throw new Error('يجب تنفيذ chat() في الفئة الفرعية'); }
  toGeminiTools() {
    return { functionDeclarations: this.tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) };
  }
  toOpenAITools() {
    return this.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }
}

class GeminiProvider extends BaseProvider {
  async chat(messages) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : m.role, parts: [{ text: m.content }] }));
    const payload = { contents, tools: [this.toGeminiTools()], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } };
    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
    const part = res.data.candidates?.[0]?.content?.parts?.[0];
    if (part?.functionCall) {
      return { role: 'assistant', content: null, tool_calls: [{ id: part.functionCall.name, function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args) } }] };
    }
    return { role: 'assistant', content: part?.text || 'عذراً، لم أتلق رداً.' };
  }
}

class DeepSeekProvider extends BaseProvider {
  async chat(messages) {
    const url = 'https://api.deepseek.com/v1/chat/completions';
    const payload = { model: config.DEEPSEEK_MODEL, messages, tools: this.toOpenAITools(), tool_choice: 'auto' };
    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.DEEPSEEK_API_KEY}` } });
    const message = res.data.choices?.[0]?.message;
    if (message?.tool_calls) return { role: 'assistant', content: null, tool_calls: message.tool_calls };
    return { role: 'assistant', content: message?.content || 'لم أتلق رداً.' };
  }
}

class OllamaProvider extends BaseProvider {
  async chat(messages) {
    const url = `${config.OLLAMA_BASE_URL}/api/chat`;
    const payload = { model: config.OLLAMA_MODEL, messages, tools: this.toOpenAITools(), stream: false };
    const res = await axios.post(url, payload);
    const message = res.data.message;
    if (message?.tool_calls) return { role: 'assistant', content: null, tool_calls: message.tool_calls };
    return { role: 'assistant', content: message?.content || 'لم أتلق رداً.' };
  }
}

function getProvider(name) {
  switch (name) {
    case 'gemini': return new GeminiProvider();
    case 'deepseek': return new DeepSeekProvider();
    case 'ollama': return new OllamaProvider();
    default: throw new Error(`موفر غير معروف: ${name}`);
  }
}

module.exports = { getProvider, TOOL_DEFINITIONS };
