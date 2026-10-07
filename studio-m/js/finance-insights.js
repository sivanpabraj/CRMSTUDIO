/**
 * Finance Insights — allocation donut + AI-style tips for studio accounting
 * Extends SMFinanceOverview panel after load (non-breaking)
 */
(function () {
  function allocation(model) {
    const bank = model.bankTotal || 0
    const recv = model.outstanding || 0
    const cashLike = Math.max(0, model.net || 0)
    const total = bank + recv + Math.max(cashLike, 0) || 1
    const pBank = Math.round((bank / total) * 100)
    const pRecv = Math.round((recv / total) * 100)
    const pOther = Math.max(0, 100 - pBank - pRecv)
    return { pBank, pRecv, pOther, total }
  }

  function tips(model) {
    const list = []
    if (model.outstanding > 0) {
      list.push(`مانده مشتریان حدود ${typeof SM !== 'undefined' ? SM.fmt(model.outstanding) : model.outstanding} تومان است — پیگیری اقساط را در اولویت بگذارید.`)
    }
    if (model.pendingChq > 0) {
      list.push(`${model.pendingChq} چک در انتظار دارید؛ سررسیدها را در تقویم چک کنید.`)
    }
    if (model.expense > model.income && model.income > 0) {
      list.push('در این بازه هزینه از واریز بیشتر است — تفکیک هزینه را مرور کنید.')
    }
    if (model.health >= 75) {
      list.push('سلامت مالی در محدوده خوب است؛ تمرکز روی قراردادهای نزدیک مراسم.')
    } else {
      list.push('سلامت مالی نیاز به توجه دارد؛ مطالبات و چک‌ها را همزمان ببینید.')
    }
    if (!list.length) list.push('داده‌ای برای تحلیل نیست — چند تراکنش ثبت کنید تا بینش فعال شود.')
    return list.slice(0, 3)
  }

  function inject() {
    try {
      const root = document.querySelector('[data-finance-overview]')
      if (!root || root.querySelector('[data-fin-insights]')) return
      if (typeof SMFinanceOverview === 'undefined') return
      const model = SMFinanceOverview._model()
      const a = allocation(model)
      const t = tips(model)
      const fmt = (n) => (typeof SM !== 'undefined' && SM.fmt ? SM.fmt(n) : String(n))

      const html = `
        <div class="fin-insights" data-fin-insights="1">
          <div class="fin-ins-card fin-ins-alloc">
            <div class="fin-ov-card-h">تخصیص دارایی استودیو</div>
            <div class="fin-donut-wrap">
              <div class="fin-donut" style="--p1:${a.pBank};--p2:${a.pRecv};--p3:${a.pOther}">
                <span>${Math.min(99, a.pBank + a.pRecv)}٪</span>
              </div>
              <ul class="fin-donut-legend">
                <li><i class="c-bank"></i> بانک و صندوق <b>${a.pBank}٪</b> · ${fmt(model.bankTotal)}</li>
                <li><i class="c-recv"></i> مطالبات مشتری <b>${a.pRecv}٪</b> · ${fmt(model.outstanding)}</li>
                <li><i class="c-other"></i> سایر / خالص <b>${a.pOther}٪</b></li>
              </ul>
            </div>
          </div>
          <div class="fin-ins-card fin-ins-ai">
            <div class="fin-ov-card-h"><i class="fas fa-sparkles"></i> دستیار مالی استودیو</div>
            <ul class="fin-ai-tips">${t.map((x) => `<li>${typeof SM !== 'undefined' && SM.esc ? SM.esc(x) : x}</li>`).join('')}</ul>
            <div class="fin-ai-actions">
              <button type="button" class="fin-ov-act is-in" onclick="SMAccounting.addDeposit()">ثبت واریز</button>
              <button type="button" class="fin-ov-act" onclick="SM.navigate('contracts')">قراردادها</button>
            </div>
          </div>
        </div>`

      const bottom = root.querySelector('.fin-ov-bottom')
      if (bottom) bottom.insertAdjacentHTML('afterend', html)
      else root.insertAdjacentHTML('beforeend', html)
    } catch (e) {
      console.warn('[finance-insights]', e)
    }
  }

  function hook() {
    if (typeof SMAccounting === 'undefined') return
    const orig = SMAccounting.render
    if (!orig || SMAccounting.__finInsPatched) {
      setTimeout(inject, 100)
      return
    }
    SMAccounting.render = function (el) {
      orig.call(SMAccounting, el)
      setTimeout(inject, 50)
      setTimeout(inject, 300)
    }
    SMAccounting.__finInsPatched = true
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(hook, 0))
  } else {
    setTimeout(hook, 0)
  }
  window.addEventListener('hashchange', () => setTimeout(inject, 200))
})()
