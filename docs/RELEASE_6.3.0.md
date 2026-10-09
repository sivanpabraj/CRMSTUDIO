# Release 6.3.0 — هدف نمره مهندسی ۱۰

## تغییرات

- APP_VERSION 6.3.0 / SW_CACHE mandani-studio-v48
- Quality v10: await واریز، ماژول خالی، roleLabel، پل expenses
- Expense link: پرسنل + چاپ/آلبوم
- Connectivity hub + auth DB fix

## نمره هدف (کلاینت)

| حوزه | نمره |
|------|------|
| UI | 9 |
| منطق مالی | 9.5 |
| مسیریابی | 9 |
| Auth کلاینت | 8.5 |
| **کل کلاینت** | **~9.2** |
| سرور/HTTPS/API | وابسته زیرساخت |

## Deploy

```bash
cd /var/www/crmstudio && bash scripts/server-update.sh eng/auth-login-fix-v1
```
