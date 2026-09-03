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

/** Base URL of the website for SEO, sitemaps, and canonical links.
 *  Production canonical domain is https://www.triadrealty.ae
 *  Set REACT_APP_SITE_URL in .env.local to override for local dev.
 */
export const SITE_URL = (
  process.env.REACT_APP_SITE_URL ||
  process.env.SITE_URL ||
  (typeof window !== "undefined" ? window.location.origin : "") ||
  "https://www.triadrealty.ae"
).replace(/\/$/, "");

