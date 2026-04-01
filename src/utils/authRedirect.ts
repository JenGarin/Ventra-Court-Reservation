const normalizeHostnameForAuth = (hostname: string) => {
  // Supabase redirect URL allowlists typically include localhost, not 0.0.0.0.
  // Vite prints 0.0.0.0 for "listen on all interfaces", but OAuth redirects
  // should target a real hostname.
  if (hostname === "0.0.0.0") return "localhost";
  return hostname;
};

export const getAuthRedirectOrigin = () => {
  const configured = String(import.meta.env.VITE_SITE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;

  const url = new URL(window.location.href);
  const hostname = normalizeHostnameForAuth(url.hostname);
  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${hostname}${port}`;
};

export const getAuthCallbackUrl = () => `${getAuthRedirectOrigin()}/auth/callback`;
