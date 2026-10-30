// the download of the current recording: /api/record.csv?token= on the http
// base of the live tracker, with the admin token the connection store hands out

export function recordUrl(api: string, token: string): string {
  return `${api.replace(/\/+$/, '')}/api/record.csv?token=${encodeURIComponent(token)}`;
}
