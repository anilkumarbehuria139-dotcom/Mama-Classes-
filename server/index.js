
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateDraft } from "./quality.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const DB = path.join(DATA, "drafts.json");
const PORT = Number(process.env.PORT || 3000);

await fs.mkdir(DATA, { recursive: true });
try {
  await fs.access(DB);
} catch {
  await fs.writeFile(DB, "[]\n");
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(data));
}

function auth(req) {
  const supplied = Buffer.from(String(req.headers["x-admin-token"] || ""));
  const expected = Buffer.from(String(process.env.ADMIN_TOKEN || ""));
  return expected.length >= 24 &&
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected);
}

async function readDrafts() {
  try {
    return JSON.parse(await fs.readFile(DB, "utf8"));
  } catch {
    return [];
  }
}

async function saveDrafts(rows) {
  const temp = DB + ".tmp";
  await fs.writeFile(temp, JSON.stringify(rows, null, 2) + "\n");
  await fs.rename(temp, DB);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 150000) throw Error("Request too large");
  }
  return JSON.parse(body || "{}");
}

function validateInput(x) {
  const errors = [];
  if (!Number.isInteger(Number(x.classLevel)) ||
      Number(x.classLevel) < 6 || Number(x.classLevel) > 12) {
    errors.push("Class must be between 6 and 12.");
  }
  if (!String(x.subject || "").trim()) errors.push("Subject is required.");
  if (!String(x.chapter || "").trim()) errors.push("Chapter is required.");
  if (!["English", "Hindi", "Odia"].includes(x.language)) {
    errors.push("Choose English, Hindi or Odia.");
  }
  if (!["notes", "mcq_set", "short_answers", "long_answers",
        "worksheet", "revision_test"].includes(x.contentType)) {
    errors.push("Unsupported content type.");
  }
  return errors;
}

function makePrompt(x) {
  const tasks = {
    notes: "Create clear notes, objectives, examples, summary and 5 self-check questions.",
    mcq_set: "Create 10 original MCQs, four options, correct answers and explanations.",
    short_answers: "Create 10 short-answer questions with model answers.",
    long_answers: "Create 5 long-answer questions with structured answers and marking guidance.",
    worksheet: "Create a mixed-difficulty worksheet with an answer key.",
    revision_test: "Create a 20-mark revision test with a complete answer key."
  };

  return `Create ORIGINAL educational content. Do not copy textbook passages.
Return JSON with title, learningObjectives (array), content (Markdown),
questions (array), answerKey, and sourceNotes.
Flag uncertainty and list official sources that a teacher should verify.
A teacher must review content before publication.

Class: ${x.classLevel}
Subject: ${x.subject}
Chapter: ${x.chapter}
Language: ${x.language}
Content type: ${x.contentType}
Difficulty: ${x.difficulty || "mixed"}
Teacher instructions: ${String(x.instructions || "None").slice(0, 1500)}
Task: ${tasks[x.contentType]}`;
}

async function generateContent(x) {
  if (!process.env.OPENAI_API_KEY) {
    throw Error("Backend API key is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Generate original educational drafts. Return valid JSON only." },
        { role: "user", content: makePrompt(x) }
      ]
    }),
    signal: AbortSignal.timeout(90000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Error(data.error?.message || `AI request failed: ${response.status}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw Error("The AI returned an empty response.");
  return JSON.parse(text);
}

async function serveStatic(res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(PUBLIC, relative);

  if (!file.startsWith(PUBLIC + path.sep) &&
      file !== path.join(PUBLIC, "index.html")) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const content = await fs.readFile(file);
    const ext = path.extname(file);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8"
    };
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, {
        ok: true,
        aiConfigured: Boolean(process.env.OPENAI_API_KEY)
      });
    }

    if (url.pathname.startsWith("/api/")) {
      if (!auth(req)) {
        return send(res, 401, { error: "Admin authentication required." });
      }

      if (req.method === "GET" && url.pathname === "/api/drafts") {
        const drafts = await readDrafts();
        drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return send(res, 200, drafts);
      }

      if (req.method === "POST" && url.pathname === "/api/generate") {
        const input = await readBody(req);
        const errors = validateInput(input);
        if (errors.length) {
          return send(res, 400, { error: "Check the form.", issues: errors });
        }

        let ai;
        try {
          ai = await generateContent(input);
        } catch (error) {
          return send(res, 502, { error: error.message });
        }

        const draft = {
          id: crypto.randomUUID(),
          title: String(ai.title || `${input.subject}: ${input.chapter}`).slice(0, 180),
          classLevel: Number(input.classLevel),
          subject: String(input.subject).slice(0, 100),
          chapter: String(input.chapter).slice(0, 180),
          language: input.language,
          contentType: input.contentType,
          content: String(ai.content || ""),
          learningObjectives: Array.isArray(ai.learningObjectives) ? ai.learningObjectives : [],
          questions: Array.isArray(ai.questions) ? ai.questions : [],
          answerKey: String(ai.answerKey || ""),
          sourceNotes: String(ai.sourceNotes || ""),
          quality: validateDraft({
            content: String(ai.content || ""),
            questions: Array.isArray(ai.questions) ? ai.questions : [],
            answerKey: String(ai.answerKey || "")
          }),
          status: "pending_review",
          createdAt: new Date().toISOString(),
          reviewedAt: null
        };

        const drafts = await readDrafts();
        drafts.push(draft);
        await saveDrafts(drafts);
        return send(res, 201, draft);
      }

      const match = url.pathname.match(/^\/api\/drafts\/([a-f0-9-]+)\/(approve|reject)$/i);

      if (req.method === "POST" && match) {
        const [, id, action] = match;
        const body = await readBody(req);
        const drafts = await readDrafts();
        const draft = drafts.find(item => item.id === id);

        if (!draft) return send(res, 404, { error: "Draft not found." });

        if (action === "approve" && draft.quality?.issues?.length) {
          return send(res, 409, {
            error: "Fix quality issues before approval.",
            issues: draft.quality.issues
          });
        }

        draft.status = action === "approve" ? "approved" : "rejected";
        draft.reviewerNotes = String(body.notes || "").slice(0, 2000);
        draft.reviewedAt = new Date().toISOString();
        await saveDrafts(drafts);
        return send(res, 200, draft);
      }

      if (req.method === "GET" && url.pathname === "/api/export-approved") {
        return send(res, 200, (await readDrafts()).filter(d => d.status === "approved"));
      }

      return send(res, 404, { error: "Unknown API endpoint." });
    }

    if (req.method === "GET") return serveStatic(res, url.pathname);
    res.writeHead(405);
    res.end("Method not allowed");
  } catch (error) {
    send(res, 500, { error: error.message || "Internal server error" });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`ExamSkeeda AI engine listening on ${PORT}`);
});
