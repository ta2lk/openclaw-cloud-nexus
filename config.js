// config.js
require('dotenv').config();

module.exports = {
  // المفاتيح
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',

  // النموذج النشط: 'gemini' | 'deepseek' | 'ollama'
  ACTIVE_PROVIDER: process.env.ACTIVE_PROVIDER || 'gemini',

  // نماذج محددة
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3.2',

  // الأمان
  WORKSPACE_DIR: process.env.WORKSPACE_DIR || './workspace',
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  // قائمة الأوامر المسموحة (تعبيرات عادية للتحقق)
  ALLOWED_COMMANDS: [
    /^git status$/,
    /^git diff$/,
    /^git commit -m ".+"$/,
    /^npm run (test|build|lint|start|dev)$/,
    /^node .+\.js$/,
    /^ls -la?$/,
    /^cat .+$/,
  ],
};
