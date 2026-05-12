const http = require("node:http");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || path.join(__dirname, "data", "state.json");
const bundledPublicDir = path.join(__dirname, "public");
const publicDir = fsSync.existsSync(bundledPublicDir) ? bundledPublicDir : __dirname;
const maxBodyBytes = 5 * 1024 * 1024;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === "/api/state" && request.method === "GET") {
      await handleGetState(response);
      return;
    }

    if (request.url === "/api/state" && request.method === "POST") {
      await handleSaveState(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
  } catch (error) {
    console.error(error);
    send(response, 500, JSON.stringify({ error: "Internal server error" }), "application/json; charset=utf-8");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`TimeTrack server listening on port ${port}`);
  console.log(`Using data file ${dataFile}`);
});


async function handleGetState(response) {
  try {
    const content = await fs.readFile(dataFile, "utf8");
    JSON.parse(content);
    send(response, 200, content, "application/json; charset=utf-8", {
      "Cache-Control": "no-store"
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      send(response, 200, "{}", "application/json; charset=utf-8", {
        "Cache-Control": "no-store"
      });
      return;
    }
    throw error;
  }
}

async function handleSaveState(request, response) {
  const body = await readBody(request);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    send(response, 400, JSON.stringify({ error: "Invalid JSON" }), "application/json; charset=utf-8");
    return;
  }

  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await fs.rename(tempFile, dataFile);
  send(response, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8", {
    "Cache-Control": "no-store"
  });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const relativePath = safePath === "/" ? "index.html" : safePath.replace(/^[/\\]/, "");
  let filePath = path.join(publicDir, relativePath);

  if (!filePath.startsWith(publicDir)) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(publicDir, "index.html");
  }

  const extension = path.extname(filePath);
  const headers = {
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };

  const content = request.method === "HEAD" ? "" : await fs.readFile(filePath);
  send(response, 200, content, contentTypes[extension] || "application/octet-stream", headers);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;

    request.setEncoding("utf8");
    request.on("data", chunk => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBodyBytes) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function send(response, status, body, contentType, headers = {}) {
  response.writeHead(status, {
    "Content-Type": contentType,
    ...headers
  });
  response.end(body);
}
