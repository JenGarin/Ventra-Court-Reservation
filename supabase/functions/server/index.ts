import { app } from "./index.tsx";

const stripServerPrefix = (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname === "/server") {
    url.pathname = "/";
  } else if (url.pathname.startsWith("/server/")) {
    url.pathname = url.pathname.slice("/server".length) || "/";
  }
  return new Request(url, req);
};

Deno.serve((req) => app.fetch(stripServerPrefix(req)));
