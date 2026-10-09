# برنامه مهندسی نوین — پلتفرم چنداستودیویی

## چشم‌انداز
CRM مشترک برای **هزاران استودیو** با جداسازی کامل داده (tenant isolation).

## اهداف هر ستون (SMART)

| ستون | هدف قابل‌اندازه‌گیری | ETA | وضعیت کد |
|------|----------------------|-----|----------|
| 1 Tenant | ۱ user با ۲ membership بدون تداخل | هفته ۱ | Schema + memberships ✅ |
| 2 DB | migrate.sh روی Postgres خالی سبز | هفته ۱ | `001_multi_tenant.sql` ✅ |
| 3 Auth | login → JWT + memberships[] | هفته ۱–۲ | auth-service + API ✅ |
| 4 API | contracts فقط با X-Studio-Id | هفته ۲ | http-api ✅ |
| 5 Client | picker اگر >1 استودیو | هفته ۲ | saas-studio-picker ✅ |
| 6 Async | SMS خارج از path بحرانی | هفته ۳ | sync-server موجود 🟡 |
| 7 Ops | systemd + nginx /api/v2 | هفته ۲ | saas-server + unit ✅ |
| 8 Migrate | import یک tenant JSON | هفته ۳ | migrate-json-tenant ✅ |

## استقرار پیشنهادی

```
Internet → Nginx
            ├─ /           → static PWA
            ├─ /api/v2/    → 127.0.0.1:3001  (saas-server)
            └─ /api/       → 127.0.0.1:3000  (sync-server legacy)
```

```bash
bash server/schema/migrate.sh
cp server/saas/systemd-crmstudio-saas.service /etc/systemd/system/
# /etc/crmstudio/saas.env ← DATABASE_URL + JWT_SECRET
systemctl enable --now crmstudio-saas
```

## تعریف Done برای فاز A

- [ ] Postgres migrate OK
- [ ] POST /api/v2/auth/register-studio
- [ ] POST /api/v2/auth/login → memberships
- [ ] GET /api/v2/contracts با X-Studio-Id
- [ ] Import ماندنی از JSON
- [ ] PWA با SaasContext

## فاز B (بعد)
transactions, personnel, pers_projects API · dual-read · حذف تدریجی JSON master
