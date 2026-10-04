/* ══════════════════════════════════════════════
   Bootstrap Dynamic Studio Branding & Title
   شخصی‌سازی داینامیک نام استودیو بر اساس تنظیمات و مخزن گیت‌هاب
   ══════════════════════════════════════════════ */
;(function () {
  function applyBranding() {
    try {
      var studioName = 'استودیو فیلم و عکس ماندنی';
      if (typeof AppConfig !== 'undefined' && AppConfig.STUDIO?.NAME) {
        studioName = AppConfig.STUDIO.NAME;
      }
      var raw = localStorage.getItem('studio_db_v5') || localStorage.getItem('studio_db_v4');
      if (raw) {
        var d = JSON.parse(raw);
        var n = d.studioInfo && d.studioInfo.name;
        if (n && n !== 'Studio M' && n !== 'Studio ERP' && d.studioInfo.setupCompleted) {
          studioName = n.trim();
        }
      }

      document.title = 'ورود — ' + studioName;

      var heroAccent = document.getElementById('auth-hero-accent-text');
      if (heroAccent) heroAccent.textContent = studioName;

      var heroBadge = document.getElementById('auth-hero-badge-text');
      if (heroBadge) heroBadge.textContent = studioName + ' • نسخه اختصاصی';

      var cardTitle = document.getElementById('auth-title-text');
      if (cardTitle) cardTitle.textContent = 'ورود به مدیریت ' + studioName;

      var loginBtn = document.getElementById('login-btn');
      if (loginBtn && !loginBtn.dataset.modified) {
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> ورود به پنل ' + studioName;
      }

      var homeLink = document.getElementById('auth-home-link');
      if (homeLink) {
        homeLink.innerHTML = '<i class="fas fa-home"></i> صفحه اصلی ' + studioName;
      }
    } catch (e) { /* ignore */ }
  }

  applyBranding();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBranding);
  }
})();
