// services/tool-executor.js

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const config = require('../config');

const execFileAsync = promisify(execFile);

// ============================================================
// Workspace
// ============================================================

const WORKSPACE =
  path.resolve(
    process.cwd(),
    config.WORKSPACE_DIR
  );

fs.mkdirSync(WORKSPACE, {
  recursive: true
});

// ============================================================
// Path Security
// ============================================================

function assertInsideWorkspace(target) {

  const relative =
    path.relative(
      WORKSPACE,
      target
    );

  if (
    relative === '' ||
    (
      !relative.startsWith('..' + path.sep) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    )
  ) {
    return;
  }

  throw new Error(
    '⛔ الوصول خارج مساحة العمل غير مسموح'
  );
}

function safeResolve(userPath = '.') {

  if (
    typeof userPath !== 'string' ||
    userPath.includes('\0')
  ) {
    throw new Error(
      '⛔ مسار غير صالح'
    );
  }

  const target =
    path.resolve(
      WORKSPACE,
      userPath
    );

  assertInsideWorkspace(target);

  return target;
}

// ============================================================
// Existing path symlink protection
// ============================================================

function assertRealPathInsideWorkspace(target) {

  if (!fs.existsSync(target)) {
    return;
  }

  const realTarget =
    fs.realpathSync(target);

  const realWorkspace =
    fs.realpathSync(WORKSPACE);

  const relative =
    path.relative(
      realWorkspace,
      realTarget
    );

  if (
    relative === '..' ||
    relative.startsWith('..' + path.sep) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      '⛔ المسار يشير إلى مكان خارج مساحة العمل'
    );
  }
}

// ============================================================
// File size
// ============================================================

function assertFileSize(content) {

  const size =
    Buffer.byteLength(
      String(content),
      'utf8'
    );

  if (size > config.MAX_FILE_SIZE) {

    throw new Error(
      `⛔ حجم الملف أكبر من الحد المسموح ` +
      `(${config.MAX_FILE_SIZE} bytes)`
    );
  }
}

// ============================================================
// Command helpers
// ============================================================

async function runExecutable(
  executable,
  args = []
) {

  const result =
    await execFileAsync(
      executable,
      args,
      {
        cwd: WORKSPACE,

        shell: false,

        maxBuffer:
          config.MAX_COMMAND_OUTPUT,

        windowsHide: true
      }
    );

  return (
    result.stdout ||
    result.stderr ||
    '(تم التنفيذ بنجاح بدون مخرجات)'
  );
}

// ============================================================
// Tool implementations
// ============================================================

const tools = {

  // ----------------------------------------------------------
  // read_file
  // ----------------------------------------------------------

  read_file: async args => {

    const fullPath =
      safeResolve(args.path);

    assertRealPathInsideWorkspace(
      fullPath
    );

    if (!fs.existsSync(fullPath)) {

      throw new Error(
        `الملف غير موجود: ${args.path}`
      );
    }

    const stat =
      fs.statSync(fullPath);

    if (!stat.isFile()) {

      throw new Error(
        'المسار المطلوب ليس ملفاً'
      );
    }

    if (
      stat.size >
      config.MAX_FILE_SIZE
    ) {

      throw new Error(
        '⛔ الملف أكبر من الحد المسموح'
      );
    }

    const content =
      fs.readFileSync(
        fullPath,
        'utf8'
      );

    return {
      success: true,
      output: content
    };
  },

  // ----------------------------------------------------------
  // write_file
  // ----------------------------------------------------------

  write_file: async args => {

    const fullPath =
      safeResolve(args.path);

    assertFileSize(args.content);

    const parent =
      path.dirname(fullPath);

    fs.mkdirSync(parent, {
      recursive: true
    });

    assertRealPathInsideWorkspace(
      parent
    );

    fs.writeFileSync(
      fullPath,
      String(args.content),
      'utf8'
    );

    return {
      success: true,

      output:
        `✅ تمت كتابة الملف: ${args.path}`
    };
  },

  // ----------------------------------------------------------
  // delete_file
  // ----------------------------------------------------------

  delete_file: async args => {

    const fullPath =
      safeResolve(args.path);

    assertRealPathInsideWorkspace(
      fullPath
    );

    if (!fs.existsSync(fullPath)) {

      throw new Error(
        `الملف غير موجود: ${args.path}`
      );
    }

    const stat =
      fs.lstatSync(fullPath);

    if (!stat.isFile()) {

      throw new Error(
        'يمكن لهذه الأداة حذف الملفات فقط'
      );
    }

    fs.unlinkSync(fullPath);

    return {
      success: true,

      output:
        `🗑️ تم حذف الملف: ${args.path}`
    };
  },

  // ----------------------------------------------------------
  // list_files
  // ----------------------------------------------------------

  list_files: async args => {

    const directory =
      safeResolve(
        args.path || '.'
      );

    assertRealPathInsideWorkspace(
      directory
    );

    const stat =
      fs.statSync(directory);

    if (!stat.isDirectory()) {

      throw new Error(
        'المسار ليس مجلداً'
      );
    }

    const items =
      fs.readdirSync(
        directory,
        {
          withFileTypes: true
        }
      );

    const output =
      items
        .sort((a, b) =>
          a.name.localeCompare(
            b.name
          )
        )
        .map(item =>
          `${item.isDirectory() ? '📁' : '📄'} ${item.name}`
        )
        .join('\n');

    return {
      success: true,

      output:
        output || '(المجلد فارغ)'
    };
  },

  // ----------------------------------------------------------
  // run_command
  // ----------------------------------------------------------

  run_command: async args => {

    const command =
      String(args.command || '')
        .trim();

    if (!command) {
      throw new Error(
        'الأمر فارغ'
      );
    }

    // npm run <script>
    const npmMatch =
      command.match(
        /^npm\s+run\s+([a-zA-Z0-9:_-]+)$/
      );

    if (npmMatch) {

      const script =
        npmMatch[1];

      if (
        !config.ALLOWED_NPM_SCRIPTS
          .includes(script)
      ) {

        throw new Error(
          `⛔ npm script غير مسموح: ${script}`
        );
      }

      const output =
        await runExecutable(
          process.platform === 'win32'
            ? 'npm.cmd'
            : 'npm',
          ['run', script]
        );

      return {
        success: true,
        output
      };
    }

    // node <relative-file.js>
    const nodeMatch =
      command.match(
        /^node\s+([^\s]+\.js)$/
      );

    if (nodeMatch) {

      const relativeScript =
        nodeMatch[1];

      const scriptPath =
        safeResolve(
          relativeScript
        );

      assertRealPathInsideWorkspace(
        scriptPath
      );

      if (!fs.existsSync(scriptPath)) {

        throw new Error(
          `الملف غير موجود: ${relativeScript}`
        );
      }

      const output =
        await runExecutable(
          'node',
          [relativeScript]
        );

      return {
        success: true,
        output
      };
    }

    // ls
    if (
      command === 'ls' ||
      command === 'ls -la' ||
      command === 'ls -l'
    ) {

      const args =
        command === 'ls'
          ? []
          : ['-l'];

      const output =
        await runExecutable(
          'ls',
          args
        );

      return {
        success: true,
        output
      };
    }

    // cat relative/file
    const catMatch =
      command.match(
        /^cat\s+([^\s]+)$/
      );

    if (catMatch) {

      const relativeFile =
        catMatch[1];

      const fullPath =
        safeResolve(
          relativeFile
        );

      assertRealPathInsideWorkspace(
        fullPath
      );

      const output =
        fs.readFileSync(
          fullPath,
          'utf8'
        );

      return {
        success: true,
        output
      };
    }

    // git status
    if (command === 'git status') {

      const output =
        await runExecutable(
          'git',
          ['status']
        );

      return {
        success: true,
        output
      };
    }

    // git diff
    if (command === 'git diff') {

      const output =
        await runExecutable(
          'git',
          ['diff']
        );

      return {
        success: true,
        output
      };
    }

    throw new Error(
      `⛔ الأمر غير مسموح: ${command}`
    );
  },

  // ----------------------------------------------------------
  // git_commit
  // ----------------------------------------------------------

  git_commit: async args => {

    const message =
      String(args.message || '')
        .trim();

    if (!message) {

      throw new Error(
        'رسالة commit مطلوبة'
      );
    }

    if (message.length > 200) {

      throw new Error(
        'رسالة commit طويلة جداً'
      );
    }

    const output =
      await runExecutable(
        'git',
        [
          'commit',
          '-m',
          message
        ]
      );

    return {
      success: true,
      output
    };
  },

  // ----------------------------------------------------------
  // git_status_diff
  // ----------------------------------------------------------

  git_status_diff: async args => {

    const type =
      args.type || 'status';

    if (
      !config.ALLOWED_GIT_COMMANDS
        .includes(type)
    ) {

      throw new Error(
        `Git command غير مسموح: ${type}`
      );
    }

    const output =
      await runExecutable(
        'git',
        [type]
      );

    return {
      success: true,
      output
    };
  }
};

// ============================================================
// executeTool
// ============================================================

async function executeTool(
  toolName,
  toolArgs = {}
) {

  console.log(
    `🔧 Tool: ${toolName}`,
    toolArgs
  );

  if (!tools[toolName]) {

    return {
      success: false,

      error:
        `الأداة "${toolName}" غير موجودة`
    };
  }

  try {

    return await tools[toolName](
      toolArgs
    );

  } catch (error) {

    console.error(
      `Tool ${toolName} error:`,
      error
    );

    return {
      success: false,

      error:
        error.message ||
        'خطأ غير معروف'
    };
  }
}

module.exports = {
  executeTool,
  tools,
  WORKSPACE
};
