// services/tool-executor.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('../config');

const execAsync = promisify(exec);
const WORKSPACE = path.resolve(process.cwd(), config.WORKSPACE_DIR);

// --- الأمان: منع الخروج من مساحة العمل ---
function safeResolve(base, userPath) {
  const target = path.resolve(base, userPath);
  if (!target.startsWith(base)) {
    throw new Error('⛔ الوصول إلى خارج مساحة العمل غير مسموح');
  }
  return target;
}

// --- تعريف الأدوات المتاحة ---
const tools = {
  read_file: async (args) => {
    const fullPath = safeResolve(WORKSPACE, args.path);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { success: true, output: content };
  },

  write_file: async (args) => {
    const fullPath = safeResolve(WORKSPACE, args.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, args.content, 'utf-8');
    return { success: true, output: `✅ تمت كتابة الملف: ${args.path}` };
  },

  delete_file: async (args) => {
    const fullPath = safeResolve(WORKSPACE, args.path);
    fs.unlinkSync(fullPath);
    return { success: true, output: `🗑️ تم حذف الملف: ${args.path}` };
  },

  list_files: async (args) => {
    const dir = args.path || '.';
    const fullPath = safeResolve(WORKSPACE, dir);
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    const list = items.map(d => `${d.isDirectory() ? '📁' : '📄'} ${d.name}`).join('\n');
    return { success: true, output: list || '(المجلد فارغ)' };
  },

  run_command: async (args) => {
    const command = args.command.trim();
    // التحقق من القائمة المسموحة
    const isAllowed = config.ALLOWED_COMMANDS.some(regex => regex.test(command));
    if (!isAllowed) {
      throw new Error(`⛔ الأمر غير مسموح به: ${command}`);
    }
    const { stdout, stderr } = await execAsync(command, { cwd: WORKSPACE, shell: '/bin/sh' });
    return { success: true, output: stdout || stderr || '(تم التنفيذ بنجاح بدون مخرجات)' };
  },

  git_commit: async (args) => {
    const message = args.message;
    if (!message) throw new Error('رسالة الـ commit مطلوبة');
    // نسمح فقط بالأمر الآمن
    const cmd = `git commit -m "${message.replace(/"/g, '\\"')}"`;
    const isAllowed = config.ALLOWED_COMMANDS.some(regex => regex.test(cmd));
    if (!isAllowed) throw new Error(`⛔ أمر commit غير مسموح به: ${cmd}`);
    const { stdout, stderr } = await execAsync(cmd, { cwd: WORKSPACE });
    return { success: true, output: stdout || stderr || '✅ تم الـ commit' };
  },

  // دمج git status و diff في أداة واحدة للاختصار
  git_status_diff: async (args) => {
    const type = args.type || 'status'; // status أو diff
    const cmd = type === 'diff' ? 'git diff' : 'git status';
    const { stdout } = await execAsync(cmd, { cwd: WORKSPACE });
    return { success: true, output: stdout || '(لا توجد تغييرات)' };
  }
};

// --- الوظيفة الرئيسية لتنفيذ أي أداة ---
async function executeTool(toolName, toolArgs) {
  console.log(`🔧 تنفيذ الأداة: ${toolName}`, toolArgs);
  if (!tools[toolName]) {
    return { success: false, error: `الأداة "${toolName}" غير معروفة.` };
  }
  try {
    const result = await tools[toolName](toolArgs);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { executeTool, tools, WORKSPACE };
