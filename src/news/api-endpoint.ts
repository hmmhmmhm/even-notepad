const API_ORIGIN = 'https://sandevistan-api.hmmhmmhm.workers.dev';

export function apiEndpoint(path: string): string {
  return new URL(path, API_ORIGIN).toString();
}
