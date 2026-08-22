function response(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

type HealthDeps = { env: (name: string) => string | undefined; now: () => Date }

export function createHealthHandler(deps: HealthDeps) {
  return (req: Request) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return response({ status: 'error' }, 405)
    }
    const configured = Boolean(
      deps.env('SUPABASE_URL')
      && deps.env('SUPABASE_ANON_KEY')
      && deps.env('ALLOWED_ORIGINS'),
    )
    return response({
      status: configured ? 'ok' : 'degraded',
      service: 'studio-m-edge',
      timestamp: deps.now().toISOString(),
    }, configured ? 200 : 503)
  }
}

const runtime = globalThis as typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response): void }
}
if (runtime.Deno?.serve) {
  runtime.Deno.serve(createHealthHandler({
    env: name => runtime.Deno?.env.get(name),
    now: () => new Date(),
  }))
}
