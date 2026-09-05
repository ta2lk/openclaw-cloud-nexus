// services/memory.js

const fs = require('fs');
const path = require('path');

const {
  WORKSPACE
} = require('./tool-executor');

const MEMORY_FILE =
  path.join(
    WORKSPACE,
    '.openclaw_memory.json'
  );

const MAX_LESSONS = 100;
const CONTEXT_LESSONS = 10;

// ============================================================
// Load
// ============================================================

function loadMemory() {

  if (!fs.existsSync(MEMORY_FILE)) {

    return {
      lessons: []
    };
  }

  try {

    const raw =
      fs.readFileSync(
        MEMORY_FILE,
        'utf8'
      );

    const data =
      JSON.parse(raw);

    if (
      !data ||
      !Array.isArray(data.lessons)
    ) {

      return {
        lessons: []
      };
    }

    return data;

  } catch (error) {

    console.error(
      'Memory read error:',
      error.message
    );

    return {
      lessons: []
    };
  }
}

// ============================================================
// Save
// ============================================================

function saveMemory(data) {

  fs.mkdirSync(
    path.dirname(MEMORY_FILE),
    {
      recursive: true
    }
  );

  const tempFile =
    `${MEMORY_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(
      data,
      null,
      2
    ),
    'utf8'
  );

  fs.renameSync(
    tempFile,
    MEMORY_FILE
  );
}

// ============================================================
// Add lesson
// ============================================================

function addLesson(
  summary,
  details
) {

  if (!summary) {
    return;
  }

  const memory =
    loadMemory();

  memory.lessons.push({
    id:
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    timestamp:
      new Date().toISOString(),

    summary:
      String(summary).slice(0, 500),

    details:
      String(details || '').slice(0, 3000)
  });

  if (
    memory.lessons.length >
    MAX_LESSONS
  ) {

    memory.lessons =
      memory.lessons.slice(
        -MAX_LESSONS
      );
  }

  saveMemory(memory);
}

// ============================================================
// Context
// ============================================================

function getMemoryContext() {

  const memory =
    loadMemory();

  if (
    !memory.lessons.length
  ) {

    return 'لا توجد دروس سابقة.';
  }

  return memory.lessons
    .slice(-CONTEXT_LESSONS)
    .map(
      lesson =>
        `- ${lesson.summary}: ${lesson.details}`
    )
    .join('\n');
}

module.exports = {
  addLesson,
  getMemoryContext,
  loadMemory
};
