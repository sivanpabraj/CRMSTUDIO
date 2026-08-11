function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

Deno.serve((req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return response({ status: 'error' }, 405)
  }
  const configured = Boolean(
    Deno.env.get('SUPABASE_URL')
    && Deno.env.get('SUPABASE_ANON_KEY')
    && Deno.env.get('ALLOWED_ORIGINS'),
  )
  return response({
    status: configured ? 'ok' : 'degraded',
    service: 'studio-m-edge',
    timestamp: new Date().toISOString(),
  }, configured ? 200 : 503)
})
