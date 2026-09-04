const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const WORKSPACE_DIR = path.join(__dirname, 'workspace');
const SKILLS_DIR = path.join(__dirname, 'skills');

if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>OpenClaw Cloud Nexus</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-950 text-slate-100 min-h-screen p-4 flex flex-col">
            <header class="bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-4 shadow-2xl flex justify-between items-center">
                <h1 class="text-base font-bold text-emerald-400">OpenClaw Cloud Nexus - السيرفر يعمل بنجاح</h1>
                <span class="px-3 py-1 bg-emerald-950 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-800">Live</span>
            </header>
            <div class="flex-1 bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col space-y-4">
                <div id="outputLog" class="flex-1 bg-slate-950 border border-slate-800 p-4 rounded-xl font-mono text-xs overflow-y-auto space-y-2">
                    <p class="text-slate-400">[System]: السيرفر جاهز ومتصل سحابياً...</p>
                </div>
                <div class="flex gap-2">
                    <input type="text" id="commandInput" placeholder="اكتب أمرك لتطوير النظام أو إنشاء مهارة..." class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono">
                    <button onclick="sendCloudCommand()" class="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition">تنفيذ</button>
                </div>
            </div>
            <script>
                async function sendCloudCommand() {
                    const input = document.getElementById('commandInput');
                    const prompt = input.value.trim();
                    if (!prompt) return;
                    const logBox = document.getElementById('outputLog');
                    logBox.innerHTML += \`<p class="text-yellow-400">[أنت]: \${prompt}</p>\`;
                    input.value = '';
                    try {
                        const res = await fetch('/api/evolve', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt })
                        });
                        const data = await res.json();
                        logBox.innerHTML += \`<p class="text-emerald-300">[السيرفر]: \${data.message}</p>\`;
                    } catch (err) {
                        logBox.innerHTML += \`<p class="text-red-400">[خطأ]: \${err.message}</p>\`;
                    }
                    logBox.scrollTop = logBox.scrollHeight;
                }
            </script>
        </body>
        </html>
    `);
});

app.post('/api/evolve', (req, res) => {
    const { prompt } = req.body;
    let message = `تم تنفيذ الأمر بنجاح: "${prompt}"`;
    if (prompt && prompt.includes('مهارة')) {
        const skillName = `skill_${Date.now()}.js`;
        fs.writeFileSync(path.join(SKILLS_DIR, skillName), `// Skill: ${prompt}`);
        message = `تم تخلق وتوليد المهارة البرمجية الجديدة: ${skillName}`;
    }
    res.json({ success: true, message });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
