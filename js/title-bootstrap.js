/* ══════════════════════════════════════════════
   Bootstrap Dynamic Studio Branding & Title
   شخصی‌سازی داینامیک نام استودیو بر اساس تنظیمات، پارامتر URL و مخزن گیت‌هاب
   ══════════════════════════════════════════════ */
;(function () {
  function applyBranding() {
    try {
      var studioName = null;

      // اولویت ۱: پارامتر URL (?studio= یا ?s=)
      var urlParams = new URLSearchParams(window.location.search);
      var queryStudio = urlParams.get('studio') || urlParams.get('s');
      if (queryStudio && queryStudio.trim()) {
        studioName = decodeURIComponent(queryStudio.trim());
      }

      var storage = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);

      // اولویت ۲: استودیوی فعال در SaaS context
      if (!studioName && storage) {
        try {
          var saasMems = storage.getItem('saas_memberships');
          var saasCur = storage.getItem('saas_current_studio_id');
          if (saasMems) {
            var memList = JSON.parse(saasMems);
            var activeMem = memList.find(function (m) { return m.studioId === saasCur; }) || memList[0];
            if (activeMem && activeMem.studioName) {
              studioName = activeMem.studioName.trim();
            }
          }
        } catch { /* ignore */ }
      }

      // اولویت ۳: استودیوی فعال از دیتابیس محلی
      if (!studioName && storage) {
        try {
          var raw = storage.getItem('studio_db_v5') || storage.getItem('studio_db_v4');
          if (raw) {
            var d = JSON.parse(raw);
            var n = d.studioInfo && d.studioInfo.name;
            if (n && n !== 'Studio M' && n !== 'Studio ERP') {
              studioName = n.trim();
            }
          }
        } catch { /* ignore */ }
      }

      // اولویت ۴: نام استودیو از کانفیگ در صورت وجود
      if (!studioName && typeof AppConfig !== 'undefined' && AppConfig.STUDIO?.NAME) {
        studioName = AppConfig.STUDIO.NAME;
      }

      document.title = studioName ? ('ورود — ' + studioName) : 'ورود به سامانه مدیریت استودیو';

      var heroAccent = document.getElementById('auth-hero-accent-text');
      if (heroAccent) heroAccent.textContent = studioName || 'سامانه مدیریت استودیو';

      var heroBadge = document.getElementById('auth-hero-badge-text');
      if (heroBadge) heroBadge.textContent = studioName ? (studioName + ' • پنل مدیریت') : 'پلتفرم ابری مدیریت استودیو';

      var cardTitle = document.getElementById('auth-title-text');
      if (cardTitle) cardTitle.textContent = studioName ? ('ورود به ' + studioName) : 'ورود به سامانه استودیو';

      var loginBtn = document.getElementById('login-btn');
      if (loginBtn && !loginBtn.dataset.modified) {
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> ' + (studioName ? ('ورود به ' + studioName) : 'ورود به پنل');
      }

      var homeLink = document.getElementById('auth-home-link');
      if (homeLink) {
        homeLink.innerHTML = '<i class="fas fa-home"></i> ' + (studioName ? ('صفحه اصلی ' + studioName) : 'صفحه اصلی');
      }
    } catch { /* ignore */ }
  }

  applyBranding();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBranding);
  }
})();
