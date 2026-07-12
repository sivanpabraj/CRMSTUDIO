/* Admin panel — پیام‌رسانی و پیگیری مراسم */

const AdminMessaging = {
  render(container) {
    if (typeof MessagingShared !== 'undefined') MessagingShared.ensureTemplates()
    const due = typeof MessagingShared !== 'undefined' ? MessagingShared.dueToday() : []
    const logs = (DB.get('commLogs') || []).slice().reverse().slice(0, 40)
    const smsOk = typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()

    container.innerHTML = `
      <div class="admin-section-header" style="--sec-clr:var(--clr-info)">
        <div class="admin-section-title"><i class="fas fa-comments"></i> پیام‌رسانی و پیگیری</div>
        <button class="section-action blue" onclick="AdminMessaging.runToday()"><i class="fas fa-bolt"></i> ارسال یادآوری‌های امروز (${due.length})</button>
      </div>

      ${!smsOk ? `<div class="admin-card" style="margin-bottom:16px;border-color:rgba(245,158,11,.4)">
        <div class="admin-card-body" style="font-size:.9rem">پنل SMS در Studio M تنظیم نشده — پیام‌ها در لاگ «در صف» ثبت می‌شوند.</div>
      </div>` : ''}

      <div class="admin-card" style="margin-bottom:16px">
        <div class="admin-card-header"><div class="admin-card-title">ارسال دستی (رسمی / شخصی)</div></div>
        <div class="admin-card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <input class="form-input ltr" id="adm-sms-to" placeholder="09..." dir="ltr"/>
            <select class="form-input" id="adm-sms-type">
              <option value="official">SMS رسمی (قالب)</option>
              <option value="personal">متن شخصی (دستی)</option>
            </select>
          </div>
          <textarea class="form-input" id="adm-sms-body" rows="3" placeholder="متن پیام..."></textarea>
          <button class="btn btn-primary" style="margin-top:10px" onclick="AdminMessaging.sendManual()"><i class="fas fa-paper-plane"></i> ارسال</button>
        </div>
      </div>

      <div class="admin-card" style="margin-bottom:16px">
        <div class="admin-card-header"><div class="admin-card-title">صف امروز — پیگیری ۲ هفته / ۳ هفته / ۱ ماه قبل مراسم</div></div>
        <div class="admin-card-body">${due.length ? due.slice(0, 15).map(item => `
          <div class="activity-item" style="padding:12px;margin-bottom:8px;border-radius:10px;background:var(--clr-surface)">
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <strong>${Utils.escapeHtml(MessagingShared.couple(item.contract))}</strong>
              <span class="badge badge-gold">${Utils.escapeHtml(item.template.name)}</span>
            </div>
            <p style="font-size:.85rem;margin:8px 0;line-height:1.6">${Utils.escapeHtml(item.text.slice(0, 120))}…</p>
            <small style="color:var(--clr-text-muted)">${item.phones.map(p => Utils.escapeHtml(p)).join('، ')}</small>
          </div>`).join('') : '<p style="text-align:center;padding:24px;color:var(--clr-text-muted)">امروز پیامی در صف نیست</p>'}
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card-header"><div class="admin-card-title">ارسال‌شده به مشتری — مطمئن شوید رفته</div></div>
        <div class="admin-table-wrap"><table class="admin-table">
          <thead><tr><th>وضعیت</th><th>مشتری</th><th>موبایل</th><th>قالب</th><th>تاریخ</th></tr></thead>
          <tbody>${logs.length ? logs.map(l => `<tr>
            <td><span class="badge badge-${l.status === 'sent' ? 'success' : 'gold'}">${Utils.escapeHtml(l.status === 'sent' ? 'ارسال' : 'در صف')}</span></td>
            <td>${Utils.escapeHtml(l.customerName || '—')}</td>
            <td dir="ltr">${Utils.escapeHtml(l.to || '')}</td>
            <td style="font-size:.8rem">${Utils.escapeHtml(l.templateName || 'دستی')}</td>
            <td>${Utils.escapeHtml(l.sendDate || '—')} ${Utils.escapeHtml(l.sendTime || '')}</td>
          </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;padding:24px">لاگی نیست</td></tr>'}
          </tbody></table></div>
      </div>`
  },

  async runToday() {
    if (typeof MessagingShared === 'undefined') return Utils.toast('ماژول پیام‌رسانی نیست', 'error')
    const r = await MessagingShared.runTodayCampaigns()
    Utils.toast(r.sent ? `${r.sent} پیام ارسال شد` : r.total ? 'در صف ثبت شد' : 'صف خالی', r.sent ? 'success' : 'info')
    Admin.showSection('messaging')
  },

  async sendManual() {
    const to = Utils.normalizePhone(document.getElementById('adm-sms-to')?.value?.trim())
    const body = document.getElementById('adm-sms-body')?.value?.trim()
    if (!Utils.isValidPhone(to) || !body) return Utils.toast('موبایل و متن الزامی است', 'error')
    const kind = document.getElementById('adm-sms-type')?.value || 'personal'
    if (typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()) {
      const res = await SmsProvider.sendStudio([to], body)
      if (typeof MessagingShared !== 'undefined') {
        MessagingShared.logOutbound({
          channel: 'sms', to, message: body,
          templateName: kind === 'official' ? 'رسمی' : 'شخصی — دستی',
          status: res?.ok ? 'sent' : 'failed'
        })
      }
      Utils.toast(res?.ok ? 'ارسال شد' : (res?.error || 'خطا'), res?.ok ? 'success' : 'error')
    } else if (typeof MessagingShared !== 'undefined') {
      MessagingShared.logOutbound({ channel: 'sms', to, message: body, templateName: 'شخصی — دستی', status: 'queued' })
      Utils.toast('در لاگ ثبت شد — SMS را در Studio M وصل کنید', 'info')
    }
    Admin.showSection('messaging')
  }
}

window.AdminMessaging = AdminMessaging
