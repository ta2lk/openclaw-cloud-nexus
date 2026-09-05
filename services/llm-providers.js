// services/llm-providers.js

const axios = require('axios');
const config = require('../config');

// ============================================================
// Tool definitions
// ============================================================

const TOOL_DEFINITIONS = [
  {
    name: 'read_file',
    description:
      'قراءة محتوى ملف داخل مساحة العمل فقط.',

    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'المسار النسبي للملف داخل مساحة العمل'
        }
      },
      required: ['path']
    }
  },

  {
    name: 'write_file',
    description:
      'إنشاء أو استبدال ملف داخل مساحة العمل فقط.',

    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'المسار النسبي للملف'
        },

        content: {
          type: 'string',
          description: 'المحتوى الكامل للملف'
        }
      },

      required: ['path', 'content']
    }
  },

  {
    name: 'delete_file',
    description:
      'حذف ملف داخل مساحة العمل فقط.',

    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string'
        }
      },

      required: ['path']
    }
  },

  {
    name: 'list_files',
    description:
      'عرض الملفات والمجلدات داخل مساحة العمل.',

    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'مسار المجلد النسبي، ويمكن تركه فارغاً'
        }
      }
    }
  },

  {
    name: 'run_command',
    description:
      'تشغيل أمر تطوير مسموح فقط داخل مساحة العمل.',

    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'الأمر المطلوب تشغيله'
        }
      },

      required: ['command']
    }
  },

  {
    name: 'git_commit',
    description:
      'تنفيذ git commit للتغييرات الموجودة.',

    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description:
            'رسالة commit'
        }
      },

      required: ['message']
    }
  },

  {
    name: 'git_status_diff',
    description:
      'عرض حالة Git أو الفرق في الملفات.',

    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['status', 'diff']
        }
      },

      required: ['type']
    }
  }
];

// ============================================================
// Base Provider
// ============================================================

class BaseProvider {

  constructor() {
    this.tools = TOOL_DEFINITIONS;
  }

  async chat() {
    throw new Error(
      'chat() يجب تنفيذه في provider'
    );
  }

  toOpenAITools() {
    return this.tools.map(tool => ({
      type: 'function',

      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  toGeminiTools() {
    return [
      {
        functionDeclarations:
          this.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }))
      }
    ];
  }
}

// ============================================================
// Gemini Provider
// ============================================================

class GeminiProvider extends BaseProvider {

  constructor() {
    super();

    if (!config.GEMINI_API_KEY) {
      throw new Error(
        'GEMINI_API_KEY غير موجود في ملف .env'
      );
    }
  }

  normalizeMessages(messages) {

    let systemInstruction = '';

    const contents = [];

    for (const message of messages) {

      if (!message) continue;

      // --------------------------------------------------------
      // System
      // --------------------------------------------------------

      if (message.role === 'system') {

        systemInstruction +=
          (systemInstruction ? '\n\n' : '') +
          String(message.content || '');

        continue;
      }

      // --------------------------------------------------------
      // User
      // --------------------------------------------------------

      if (message.role === 'user') {

        contents.push({
          role: 'user',

          parts: [
            {
              text: String(message.content || '')
            }
          ]
        });

        continue;
      }

      // --------------------------------------------------------
      // Assistant + tool calls
      // --------------------------------------------------------

      if (
        message.role === 'assistant' &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length
      ) {

        const parts = [];

        if (message.content) {
          parts.push({
            text: String(message.content)
          });
        }

        for (const call of message.tool_calls) {

          let args = {};

          try {
            args =
              typeof call.function.arguments === 'string'
                ? JSON.parse(call.function.arguments)
                : (call.function.arguments || {});
          } catch {
            args = {};
          }

          parts.push({
            functionCall: {
              id: call.id || call.function.name,
              name: call.function.name,
              args
            }
          });
        }

        contents.push({
          role: 'model',
          parts
        });

        continue;
      }

      // --------------------------------------------------------
      // Assistant normal text
      // --------------------------------------------------------

      if (message.role === 'assistant') {

        contents.push({
          role: 'model',

          parts: [
            {
              text: String(message.content || '')
            }
          ]
        });

        continue;
      }

      // --------------------------------------------------------
      // Tool result
      // --------------------------------------------------------

      if (message.role === 'tool') {

        let result;

        try {
          result =
            typeof message.content === 'string'
              ? JSON.parse(message.content)
              : message.content;
        } catch {
          result = {
            output: String(message.content || '')
          };
        }

        const functionName =
          message.name ||
          message.tool_name ||
          message.tool_call_id;

        contents.push({
          role: 'user',

          parts: [
            {
              functionResponse: {
                id: message.tool_call_id,
                name: functionName,
                response: result
              }
            }
          ]
        });
      }
    }

    return {
      systemInstruction:
        systemInstruction
          ? {
              parts: [
                {
                  text: systemInstruction
                }
              ]
            }
          : undefined,

      contents
    };
  }

  async chat(messages) {

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${config.GEMINI_MODEL}:generateContent`;

    const normalized =
      this.normalizeMessages(messages);

    const payload = {
      contents: normalized.contents,

      tools: this.toGeminiTools(),

      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO'
        }
      },

      generationConfig: {
        temperature: 0.2
      }
    };

    if (normalized.systemInstruction) {
      payload.systemInstruction =
        normalized.systemInstruction;
    }

    try {

      const response = await axios.post(
        url,
        payload,
        {
          params: {
            key: config.GEMINI_API_KEY
          },

          headers: {
            'Content-Type': 'application/json'
          },

          timeout: 120000
        }
      );

      const candidate =
        response.data?.candidates?.[0];

      if (!candidate) {
        throw new Error(
          'Gemini لم يرجع candidate صالح'
        );
      }

      const parts =
        candidate.content?.parts || [];

      // --------------------------------------------------------
      // Collect all function calls
      // --------------------------------------------------------

      const toolCalls = [];

      for (const part of parts) {

        if (part.functionCall) {

          const call =
            part.functionCall;

          toolCalls.push({
            id:
              call.id ||
              `${call.name}-${Date.now()}-${toolCalls.length}`,

            function: {
              name: call.name,

              arguments:
                JSON.stringify(
                  call.args || {}
                )
            }
          });
        }
      }

      if (toolCalls.length) {

        return {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls
        };
      }

      // --------------------------------------------------------
      // Normal text response
      // --------------------------------------------------------

      const text =
        parts
          .filter(part => part.text)
          .map(part => part.text)
          .join('\n')
          .trim();

      return {
        role: 'assistant',

        content:
          text ||
          'لم يرجع Gemini محتوى نصياً.'
      };

    } catch (error) {

      const apiError =
        error.response?.data;

      console.error(
        'Gemini API error:',
        JSON.stringify(
          apiError || error.message,
          null,
          2
        )
      );

      throw new Error(
        apiError?.error?.message ||
        error.message ||
        'فشل الاتصال بـ Gemini'
      );
    }
  }
}

// ============================================================
// DeepSeek Provider
// ============================================================

class DeepSeekProvider extends BaseProvider {

  constructor() {
    super();

    if (!config.DEEPSEEK_API_KEY) {
      throw new Error(
        'DEEPSEEK_API_KEY غير موجود في .env'
      );
    }
  }

  async chat(messages) {

    const url =
      'https://api.deepseek.com/v1/chat/completions';

    const payload = {
      model: config.DEEPSEEK_MODEL,

      messages,

      tools: this.toOpenAITools(),

      tool_choice: 'auto',

      temperature: 0.2
    };

    try {

      const response = await axios.post(
        url,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',

            Authorization:
              `Bearer ${config.DEEPSEEK_API_KEY}`
          },

          timeout: 120000
        }
      );

      const message =
        response.data?.choices?.[0]?.message;

      if (!message) {
        throw new Error(
          'DeepSeek لم يرجع رسالة صالحة'
        );
      }

      if (
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length
      ) {

        return {
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.tool_calls
        };
      }

      return {
        role: 'assistant',
        content:
          message.content ||
          'لم يرجع DeepSeek محتوى.'
      };

    } catch (error) {

      const apiError =
        error.response?.data;

      console.error(
        'DeepSeek API error:',
        JSON.stringify(
          apiError || error.message,
          null,
          2
        )
      );

      throw new Error(
        apiError?.error?.message ||
        error.message ||
        'فشل الاتصال بـ DeepSeek'
      );
    }
  }
}

// ============================================================
// Ollama Provider
// ============================================================

class OllamaProvider extends BaseProvider {

  async chat(messages) {

    const base =
      config.OLLAMA_BASE_URL.replace(/\/+$/, '');

    const url =
      `${base}/api/chat`;

    const payload = {
      model: config.OLLAMA_MODEL,

      messages,

      tools: this.toOpenAITools(),

      stream: false,

      options: {
        temperature: 0.2
      }
    };

    try {

      const response = await axios.post(
        url,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },

          timeout: 120000
        }
      );

      const message =
        response.data?.message;

      if (!message) {
        throw new Error(
          'Ollama لم يرجع رسالة صالحة'
        );
      }

      if (
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length
      ) {

        return {
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.tool_calls
        };
      }

      return {
        role: 'assistant',

        content:
          message.content ||
          'لم يرجع Ollama محتوى.'
      };

    } catch (error) {

      console.error(
        'Ollama API error:',
        error.response?.data ||
        error.message
      );

      throw new Error(
        error.response?.data?.error ||
        error.message ||
        'فشل الاتصال بـ Ollama'
      );
    }
  }
}

// ============================================================
// Provider Factory
// ============================================================

function getProvider(name) {

  switch (name) {

    case 'gemini':
      return new GeminiProvider();

    case 'deepseek':
      return new DeepSeekProvider();

    case 'ollama':
      return new OllamaProvider();

    default:
      throw new Error(
        `موفر غير معروف: ${name}`
      );
  }
}

module.exports = {
  getProvider,
  TOOL_DEFINITIONS
};
