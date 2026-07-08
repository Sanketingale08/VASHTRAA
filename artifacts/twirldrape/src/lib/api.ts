const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function getApiUrl(path: string): string {
  return `${basePath}${path}`;
}
