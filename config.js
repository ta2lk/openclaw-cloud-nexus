// config.js
require('dotenv').config();

const path = require('path');

const ACTIVE_PROVIDER = (
  process.env.ACTIVE_PROVIDER || 'gemini'
).toLowerCase();

const VALID_PROVIDERS = ['gemini', 'deepseek', 'ollama'];

if (!VALID_PROVIDERS.includes(ACTIVE_PROVIDER)) {
  throw new Error(
    `ACTIVE_PROVIDER غير صالح: ${ACTIVE_PROVIDER}. ` +
    `القيم المسموحة: ${VALID_PROVIDERS.join(', ')}`
  );
}

module.exports = {
  // ============================================================
  // Provider API Keys
  // ============================================================

  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',

  OLLAMA_BASE_URL:
    process.env.OLLAMA_BASE_URL || 'http://localhost:11434',

  // ============================================================
  // Active provider
  // ============================================================

  ACTIVE_PROVIDER,

  // ============================================================
  // Models
  // ============================================================

  GEMINI_MODEL:
    process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  DEEPSEEK_MODEL:
    process.env.DEEPSEEK_MODEL || 'deepseek-chat',

  OLLAMA_MODEL:
    process.env.OLLAMA_MODEL || 'llama3.2',

  // ============================================================
  // Server
  // ============================================================

  PORT: Number(process.env.PORT || 3000),

  NODE_ENV:
    process.env.NODE_ENV || 'development',

  // ============================================================
  // Workspace
  // ============================================================

  WORKSPACE_DIR:
    process.env.WORKSPACE_DIR || './workspace',

  MAX_FILE_SIZE:
    Number(process.env.MAX_FILE_SIZE || 10 * 1024 * 1024),

  // ============================================================
  // Agent
  // ============================================================

  MAX_AGENT_ITERATIONS:
    Number(process.env.MAX_AGENT_ITERATIONS || 10),

  MAX_HISTORY_MESSAGES:
    Number(process.env.MAX_HISTORY_MESSAGES || 30),

  // ============================================================
  // Security
  // ============================================================

  // الأوامر المسموحة فقط.
  // لا يتم تمريرها مباشرة إلى shell.

  ALLOWED_NPM_SCRIPTS: [
    'test',
    'build',
    'lint',
    'start',
    'dev'
  ],

  ALLOWED_GIT_COMMANDS: [
    'status',
    'diff'
  ],

  MAX_COMMAND_OUTPUT:
    Number(process.env.MAX_COMMAND_OUTPUT || 100000),

  // ============================================================
  // Helper
  // ============================================================

  ROOT_DIR: path.resolve(process.cwd())
};
