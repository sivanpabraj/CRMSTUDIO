const baseUrl = (process.env.LOAD_BASE_URL || 'http://127.0.0.1:4174').replace(/\/$/, '')
const total = Number(process.env.LOAD_REQUESTS || 200)
const concurrency = Number(process.env.LOAD_CONCURRENCY || 20)
const paths = ['/health.json', '/site.html', '/index.html', '/contract.html', '/studio-m/']
const times = []
const failures = []
let cursor = 0

async function worker() {
  while (cursor < total) {
    const index = cursor++
    const path = paths[index % paths.length]
    const started = performance.now()
    try {
      const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
      times.push(performance.now() - started)
      if (response.status >= 500) failures.push(`${path}:${response.status}`)
      await response.arrayBuffer()
    } catch (error) {
      failures.push(`${path}:${error.message}`)
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker))
times.sort((a, b) => a - b)
const percentile = p => times[Math.min(times.length - 1, Math.floor(times.length * p))] || Infinity
const p95 = percentile(0.95)
const errorRate = failures.length / total
console.log(JSON.stringify({ baseUrl, total, concurrency, errorRate, p50Ms: Math.round(percentile(0.5)), p95Ms: Math.round(p95) }, null, 2))
if (errorRate > 0.01 || p95 > 1500) {
  console.error(`load smoke failed — failures=${failures.slice(0, 10).join(', ')}`)
  process.exit(1)
}
