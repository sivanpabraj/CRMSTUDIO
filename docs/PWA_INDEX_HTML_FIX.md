# رفع فوری index.html برای PWA

صفحه `index.html` هنوز در `<head>` این کد را دارد و SW را می‌کشد:

```js
navigator.serviceWorker.getRegistrations().then(function(regs) {
  for (var i = 0; i < regs.length; i++) regs[i].unregister();
});
caches.keys().then(...delete...)
```

## کار انجام‌شده در شاخه eng/pwa-hardening-v1
- `sw.js` واقعی (v41)
- `studio-m/index.html` و `site.html` اصلاح شدند
- `js/sw-register.js` با ثبت تأخیری برای شکست race
- `js/pwa-boot.js` برای boot زودهنگام

## کار باقی‌مانده روی index.html (۱ دقیقه)
1. بلوک unregister/caches.delete را از head حذف کن
2. این‌ها را اضافه کن:

```html
<link rel="manifest" href="./manifest.json"/>
<meta name="mobile-web-app-capable" content="yes"/>
<link rel="apple-touch-icon" href="./icons/icon-192.png"/>
```

3. قبل از `</body>`:

```html
<script src="js/sw-register.js"></script>
```

تا آن زمان `sw-register.js` با ثبت مجدد پس از ۴۰۰ms race را خنثی می‌کند، ولی حذف کامل unregister تمیزتر است.
