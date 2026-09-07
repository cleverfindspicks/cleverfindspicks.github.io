// Registration endpoint only. Never echo, log, store, or exchange incoming codes.
// Enable authorization only after configuring credentials, state validation,
// token storage, and the declared third-party processing arrangements.
export async function GET(request: Request) {
  const hasParameters = new URL(request.url).search.length > 0;
  const title = hasParameters ? 'Connection not completed' : 'Clever Finds connection';
  const message = hasParameters
    ? 'Authorization is not enabled yet. No account connection was completed. Close this tab and return to the application setup.'
    : 'This is the registered connection endpoint for Clever Finds. Account authorization is not enabled yet.';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#071424;color:#f5f8ff;font:18px/1.6 Arial,sans-serif;min-height:100svh;display:grid;place-items:center}main{max-width:560px;padding:40px}h1{font-size:32px;line-height:1.2;color:#53dafa}p{color:#c4d2e3}a{color:#ffd537}</style></head><body><main><h1>${title}</h1><p>${message}</p><a href="/">Clever Finds</a></main></body></html>`, {
    status: hasParameters ? 400 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    },
  });
}
