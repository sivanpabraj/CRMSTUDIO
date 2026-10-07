# باقی‌مانده CRMSTUDIO — eng/glass-pwa-ux-v2

## انجام‌شده در این شاخه
- PWA hardening (SW, session-sign, E2E اسکلت)
- تم شیشه‌ای + GlassStats + shareLog
- Finance Overview (نمودار، سلامت، اکشن)
- Allocation + AI insight card (این کامیت)
- server-update.sh برای آپدیت یک‌کلیکه

## باقی‌مانده واقعی (اولویت)

| اولویت | کار | چرا |
|--------|-----|-----|
| P0 | یک‌بار `checkout eng/glass-pwa-ux-v2` روی سرور + update | بدون این، اپ نسخه قدیم می‌ماند |
| P0 | `patch-index-pwa.sh` روی index اصلی | SW unregister |
| P1 | Merge به main بعد از تست ۱ هفته | پایداری |
| P1 | اتصال عمیق‌تر KPI به پرتال پرسنل/مشتری | الان فقط studio-m |
| P2 | شکستن modules.js / settings.js | maintainability |
| P2 | نمودار خطی واقعی ماهانه از transactions | bucket فعلی تقریبی است |
| P3 | WhatsApp Business API | deep-link فعلاً کافی |
| P3 | Push notification | اختیاری |

## از اسکرین‌های جدید — چه بگیریم / نگیریم

**بگیریم:** کارت‌های سفید نرم، donut تخصیص، جدول وضعیت رنگی، پنل دستیار، gauge انطباق، checklist شروع.
**نگیریم:** سهام/کریپتو، latency ms، token cost AI به‌عنوان KPI اصلی استودیو.
