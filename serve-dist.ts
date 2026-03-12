const port = Number(Deno.args[0] || 4173);
const distDir = `${Deno.cwd()}${Deno.build.os === "windows" ? "\\" : "/"}dist`;

const contentTypeForPath = (pathname: string) => {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
};

const safeJoin = (base: string, rel: string) => {
  const normalized = rel.replaceAll("\\", "/");
  if (normalized.includes("..")) return null;
  const trimmed = normalized.replace(/^\/+/, "");
  const sep = Deno.build.os === "windows" ? "\\" : "/";
  return `${base}${sep}${trimmed.replaceAll("/", sep)}`;
};

const readFileSafe = async (filepath: string) => {
  const stat = await Deno.stat(filepath);
  if (stat.isDirectory) return null;
  const bytes = await Deno.readFile(filepath);
  return bytes;
};

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  let pathname = decodeURIComponent(url.pathname || "/");
  if (pathname === "/") pathname = "/index.html";

  const resolved = safeJoin(distDir, pathname);
  let bytes: Uint8Array | null = null;

  if (resolved) {
    try {
      bytes = await readFileSafe(resolved);
    } catch {
      bytes = null;
    }
  }

  // SPA fallback for client-side routes.
  if (!bytes) {
    try {
      bytes = await Deno.readFile(safeJoin(distDir, "/index.html")!);
      pathname = "/index.html";
    } catch {
      return new Response("dist/index.html not found. Build the app first.", { status: 500 });
    }
  }

  const headers = new Headers();
  headers.set("content-type", contentTypeForPath(pathname));
  headers.set("cache-control", pathname.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable");
  return new Response(bytes as unknown as BodyInit, { status: 200, headers });
};

console.log(`Serving ${distDir}`);
console.log(`Open: http://localhost:${port}`);
console.log(`LAN:  http://0.0.0.0:${port}`);

Deno.serve({ port, hostname: "0.0.0.0" }, handler);
