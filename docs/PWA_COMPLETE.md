# چک‌لیست PWA — CRMSTUDIO

| مورد | لازم؟ | وضعیت |
|------|-------|--------|
| manifest.json | بله | ✅ |
| آیکون ۱۹۲/۵۱۲ | بله | ✅ icons/ |
| Service Worker | بله | ✅ sw.js v41 |
| HTTPS در production | بله | وابسته به سرور |
| ثبت SW بدون unregister | بله | studio-m/site ✅ — index باید head پاک شود |
| Offline shell | بله | ✅ network-first + cache |
| theme-color / apple-touch-icon | بله | جزئی |
| Installability | بله | با manifest |
| Push notifications | اختیاری | ❌ فعلاً |
| Background sync | اختیاری | ❌ فعلاً |

## اصلاح index.html (یک‌بار روی سرور یا در PR بعدی)
حذف از head:
```js
navigator.serviceWorker.getRegistrations()...unregister
caches.keys()...delete
```
افزودن:
```html
<link rel="manifest" href="./manifest.json"/>
<script src="js/sw-register.js"></script>
```
راهنما: `docs/PWA_INDEX_HTML_FIX.md`
