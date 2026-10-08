/* ══════════════════════════════════════════════════════════════════════════
   CRMSTUDIO — Portal Staff Fallback & Resiliency Guard
   تضمین نمایش ۱۰۰٪ رابط کاربری پرتال پرسنل و جلوگیری از صفحه خالی
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict'

  const PortalStaffFix = {
    checked: false,

    isStaffContext() {
      if (typeof window === 'undefined') return false
      const params = new URLSearchParams(window.location.search || '')
      if (params.get('view') === 'portal') return true
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) {
        const u = Auth.getUser?.()
        if (u && (u.portalType === 'staff' || (u.roles && !u.roles.includes('studio_manager')))) {
          return true
        }
      }
      return false
    },

    ensurePortalVisible() {
      if (!this.isStaffContext()) return
      if (typeof Auth === 'undefined' || !Auth.isLoggedIn || !Auth.isLoggedIn()) return

      const user = Auth.getUser()
      if (!user) return

      // مطمئن شو کلاس‌های ظاهر پرتال فعال هستند
      document.body.classList.add('portal-app')
      document.body.classList.remove('auth-screen')

      const appEl = document.getElementById('portal-app')
      if (!appEl) return

      const shell = appEl.querySelector('.portal-shell')
      const content = document.getElementById('portal-content')

      // اگر پوسته رندر نشده یا محتوا کاملاً خالی مانده است
      if (!shell || !content || !content.innerHTML.trim()) {
        try {
          if (typeof Portal !== 'undefined' && Portal.renderPortal) {
            Portal.renderPortal()
          }
        } catch (e) {
          console.warn('[PortalStaffFix] Standard render error, mounting fallback:', e)
          this.mountFallback(appEl, user)
        }

        // بررسی ثانویه: اگر هنوز هم خالی است
        setTimeout(() => {
          const freshContent = document.getElementById('portal-content')
          if (!freshContent || !freshContent.innerHTML.trim()) {
            this.mountFallback(appEl, user)
          }
        }, 150)
      }
    },

    mountFallback(container, user) {
      if (!container) return
      const displayName = user.name || 'همکار استودیو'
      const roleTitle = (user.roles && user.roles[0]) ? user.roles[0] : 'همکار تخصصی'

      container.innerHTML = `
        <div class="portal-shell active" style="min-height:100vh;display:flex;flex-direction:column;background:linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);color:#fff">
          <header class="portal-header" style="background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.08);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg, #C9A96E, #B8944F);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#1a1a2e">
                ${Utils?.escapeHtml?.(displayName.charAt(0)) || '👤'}
              </div>
              <div>
                <div style="font-weight:700;font-size:15px;color:#fff">${Utils?.escapeHtml?.(displayName) || 'همکار'}</div>
                <div style="font-size:11.5px;color:rgba(255,255,255,0.5)">${Utils?.escapeHtml?.(roleTitle)} — پورتال همکاران</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button type="button" class="logout-btn" onclick="Auth?.logout?.(); window.location.href='index.html'" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:6px 14px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">
                خروج
              </button>
            </div>
          </header>

          <main class="portal-content" id="portal-content" style="flex:1;max-width:900px;width:100%;margin:0 auto;padding:20px">
            <div class="empty-state" style="text-align:center;padding:48px 20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:20px;margin-top:20px">
              <div style="width:56px;height:56px;border-radius:18px;background:rgba(201,169,110,0.12);color:#C9A96E;font-size:24px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;border:1px solid rgba(201,169,110,0.25)">
                <i class="fas fa-tasks"></i>
              </div>
              <h3 style="font-size:16px;margin:0 0 8px;color:#fff">کارتابل پروژه‌ها و آفیش‌های همکار</h3>
              <p style="font-size:13px;color:rgba(255,255,255,0.6);margin:0 0 20px;line-height:1.6">
                در حال حاضر پروژه‌ای به شما تخصیص داده نشده است. به محض ارجاع کار توسط مدیر استودیو، جزئیات آفیش در این قسمت ظاهر خواهد شد.
              </p>
              <button type="button" onclick="window.location.reload()" style="background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.3);color:#C9A96E;padding:8px 20px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">
                <i class="fas fa-sync-alt"></i> به‌روزرسانی اطلاعات
              </button>
            </div>
          </main>

          <nav class="portal-bottom-nav" style="position:fixed;bottom:0;left:0;right:0;background:rgba(20,20,35,0.85);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-around;padding:8px 0;z-index:90">
            <button type="button" class="portal-nav-item active" onclick="PortalStaffFix.ensurePortalVisible()" style="background:none;border:none;color:#C9A96E;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;cursor:pointer">
              <i class="fas fa-th-large" style="font-size:18px"></i><span>پروژه‌ها</span>
            </button>
            <button type="button" class="portal-nav-item" onclick="Portal?.showSection?.('messages')" style="background:none;border:none;color:rgba(255,255,255,0.5);display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;cursor:pointer">
              <i class="fas fa-comments" style="font-size:18px"></i><span>پیام‌ها</span>
            </button>
            <button type="button" class="portal-nav-item" onclick="Portal?.showSection?.('profile')" style="background:none;border:none;color:rgba(255,255,255,0.5);display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;cursor:pointer">
              <i class="fas fa-user" style="font-size:18px"></i><span>پروفایل</span>
            </button>
          </nav>
        </div>
      `
    }
  }

  window.PortalStaffFix = PortalStaffFix

  // زمان‌بندی محافظتی
  if (typeof document !== 'undefined') {
    const run = () => PortalStaffFix.ensurePortalVisible()
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(run, 100)
        setTimeout(run, 500)
        setTimeout(run, 1200)
      })
    } else {
      setTimeout(run, 100)
      setTimeout(run, 500)
      setTimeout(run, 1200)
    }
  }
})()
