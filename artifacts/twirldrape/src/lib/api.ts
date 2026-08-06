/**
 * Returns the absolute API path for use in fetch() calls.
 *
 * API calls must NOT be prefixed with BASE_URL (the web app's base path).
 * In production, the API server is registered at /api/* independently of the
 * web app's path prefix. Prepending BASE_URL routes the request to the web
 * app's static file server instead of the API server.
 *
 * BASE_URL (import.meta.env.BASE_URL) is only for client-side navigation
 * and static asset URLs — never for fetch() calls.
 */
export function getApiUrl(path: string): string {
  return path;
}
