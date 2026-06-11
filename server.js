const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const PICKS_FILE = path.join(DATA_DIR, "picks.json");
const RESULTS_FILE = path.join(DATA_DIR, "results.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function ensureJsonFile(filePath, fallback) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
  }
}

async function readJsonFile(filePath, fallback) {
  await ensureJsonFile(filePath, fallback);
  const raw = await fs.readFile(filePath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, data) {
  await ensureJsonFile(filePath, Array.isArray(data) ? [] : {});
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readPicks() {
  const picks = await readJsonFile(PICKS_FILE, []);
  return Array.isArray(picks) ? picks : [];
}

async function writePicks(picks) {
  await writeJsonFile(PICKS_FILE, picks);
}

async function readResults() {
  const results = await readJsonFile(RESULTS_FILE, {});
  return results && !Array.isArray(results) ? results : {};
}

async function writeResults(results) {
  await writeJsonFile(RESULTS_FILE, results);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function validateSubmission(payload) {
  if (!payload || typeof payload !== "object") return "Missing submission";
  if (typeof payload.playerName !== "string" || !payload.playerName.trim()) {
    return "Player name is required";
  }
  if (!Array.isArray(payload.predictions) || payload.predictions.length === 0) {
    return "Predictions are required";
  }

  for (const prediction of payload.predictions) {
    if (!prediction || typeof prediction !== "object") return "Invalid prediction";
    if (typeof prediction.fixtureId !== "string") return "Fixture id is required";
    if (!Number.isInteger(prediction.homeScore) || prediction.homeScore < 0 || prediction.homeScore > 99) {
      return "Home scores must be whole numbers from 0 to 99";
    }
    if (!Number.isInteger(prediction.awayScore) || prediction.awayScore < 0 || prediction.awayScore > 99) {
      return "Away scores must be whole numbers from 0 to 99";
    }
  }

  return null;
}

function validateResults(payload) {
  if (!payload || typeof payload !== "object" || !payload.results || typeof payload.results !== "object") {
    return "Results are required";
  }

  for (const [fixtureId, result] of Object.entries(payload.results)) {
    if (typeof fixtureId !== "string" || !fixtureId) return "Fixture id is required";
    if (!result || typeof result !== "object") return "Invalid result";
    if (!Number.isInteger(result.homeScore) || result.homeScore < 0 || result.homeScore > 99) {
      return "Home scores must be whole numbers from 0 to 99";
    }
    if (!Number.isInteger(result.awayScore) || result.awayScore < 0 || result.awayScore > 99) {
      return "Away scores must be whole numbers from 0 to 99";
    }
  }

  return null;
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/picks") {
    const picks = await readPicks();
    sendJson(res, 200, { picks });
    return;
  }

  if (req.method === "GET" && req.url === "/api/results") {
    const results = await readResults();
    sendJson(res, 200, { results });
    return;
  }

  if (req.method === "POST" && req.url === "/api/picks") {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }

    const error = validateSubmission(payload);
    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const picks = await readPicks();
    const playerName = payload.playerName.trim();
    const now = new Date().toISOString();
    const submission = {
      id: crypto.randomUUID(),
      playerName,
      createdAt: now,
      updatedAt: now,
      predictions: payload.predictions
    };

    const existingIndex = picks.findIndex(pick => pick.playerName.toLowerCase() === playerName.toLowerCase());
    if (existingIndex >= 0) {
      submission.id = picks[existingIndex].id || submission.id;
      submission.createdAt = picks[existingIndex].createdAt || submission.createdAt;
      picks[existingIndex] = submission;
    } else {
      picks.push(submission);
    }

    await writePicks(picks);
    sendJson(res, 200, { pick: submission, savedCount: picks.length });
    return;
  }

  if (req.method === "POST" && req.url === "/api/results") {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }

    const error = validateResults(payload);
    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    await writeResults(payload.results);
    sendJson(res, 200, { results: payload.results, savedCount: Object.keys(payload.results).length });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalizedPath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
    } else {
      await serveStatic(req, res);
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

Promise.all([
  ensureJsonFile(PICKS_FILE, []),
  ensureJsonFile(RESULTS_FILE, {})
]).then(() => {
  server.listen(PORT, () => {
    console.log(`World Cup Game Predictor running at http://localhost:${PORT}`);
    console.log(`Saving picks to ${PICKS_FILE}`);
    console.log(`Saving results to ${RESULTS_FILE}`);
  });
});
