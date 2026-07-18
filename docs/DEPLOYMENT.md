# Studio M — Deployment Guide

## Local development

```bash
npm install
cp .env.example .env   # optional: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:5173/site.html
```

## Production build

```bash
npm run test
npm run lint
npm run build          # output: dist/
```

## Docker (nginx)

```bash
docker build -t studio-m:6.0.0 .
docker run -p 8080:80 studio-m:6.0.0
# Health: http://localhost:8080/health.json
```

## Static hosting

Deploy `dist/` to any static host (Netlify, Cloudflare Pages, S3+CloudFront).

Required headers (see `docker/nginx.conf`):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Supabase

1. Create project
2. Run migrations `001`–`006` from `supabase/migrations/`
3. Set Auth Site URL → `https://your-domain/studio-m/auth-callback.html`
4. Deploy edge function `send-sms`:
   ```bash
   supabase secrets set SMS_PROVIDER=kavenegar SMS_API_KEY=... SMS_LINE_NUMBER=...
   supabase secrets set ALLOWED_ORIGINS=https://your-domain.com
   supabase functions deploy send-sms
   ```
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time

## CI

GitHub Actions runs `lint`, `test`, `build` on push/PR to main.

## Security checklist

- [ ] Never commit `.env` or service_role keys
- [ ] Use SMS edge proxy in production (not client-side API keys)
- [ ] Apply migration 005 (manager-only snapshot read)
- [ ] Rotate credentials if ever exposed in chat/logs
