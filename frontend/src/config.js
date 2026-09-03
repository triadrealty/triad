/**
 * config.js — API URL configuration for the integrated frontend/backend.
 *
 * The React app is always served by the Python backend at the same origin,
 * so all API calls are relative paths (/api/...).  No proxy, no CORS, no
 * cross-origin issues.
 *
 * During local `npm start` development (port 3000/3001) you can optionally
 * point to a running backend via REACT_APP_BACKEND_URL in .env.local.
 */

const _devOverride =
  typeof window !== "undefined" &&
  (window.location.port === "3000" || window.location.port === "3001")
    ? (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "")
    : "";

/** Base URL of the backend. Empty string = same origin (production default). */
export const getBackendUrl = () => _devOverride;

/** Full base URL for all /api/* requests. */
export const API_URL = `${_devOverride}/api`;

/**
 * Resolve a media URL (e.g. /uploads/...) to an absolute URL.
 * In production (same origin) this is a no-op.
 */
export const resolveMediaUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("/uploads") && _devOverride) {
    return `${_devOverride}${url}`;
  }
  return url;
};

/** Base URL of the website for SEO, sitemaps, canonical links, and JSON-LD.
 *
 *  REACT_APP_SITE_URL is injected at build time by render.yaml / .env.local.
 *  It is always https://www.triadrealty.ae in production builds.
 *
 *  DO NOT fall back to window.location.origin — that would allow a Render
 *  hostname (e.g. webtriad-9.onrender.com) to become the canonical SEO URL
 *  when someone visits the site via the Render subdomain.
 *
 *  For local development, set REACT_APP_SITE_URL=http://localhost:3000
 *  in frontend/.env.local.
 */
export const SITE_URL = (
  process.env.REACT_APP_SITE_URL ||
  "https://www.triadrealty.ae"
).replace(/\/$/, "");

