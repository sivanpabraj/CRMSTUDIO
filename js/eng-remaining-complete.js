/**
 * تکمیل موارد مانده — پس از ورود sync اجباری · هزینه → دفتر حسابداری
 */
(function (w) {
  'use strict'

  async function forceSyncPull() {
    try {
      if (w.ServerSync?.pull) {
        await w.ServerSync.pull({ force: true, initial: true })
        return true
      }
    } catch (e) {
      console.warn('[eng-complete] sync pull', e)
    }
    return false
  }

  function patchLoginSync() {
    if (typeof Auth === 'undefined' || Auth.__completeSync) return
    Auth.__completeSync = true
    const wrap = (fnName) => {
      const orig = Auth[fnName]?.bind(Auth)
      if (!orig || Auth['__cs_' + fnName]) return
      Auth['__cs_' + fnName] = true
      Auth[fnName] = async function () {
        const res = await orig.apply(this, arguments)
        if (res?.ok) {
          forceSyncPull().catch(() => {})
          if (w.ServerSync?.push) {
            setTimeout(() => w.ServerSync.push({ force: true }).catch(() => {}), 1500)
          }
        }
        return res
      }
    }
    wrap('login')
    wrap('loginWithOtp')
  }

  /** ثبت هزینه جاری → تراکنش withdrawal در حسابداری */
  function patchExpensesToLedger() {
    if (typeof SecureDB === 'undefined' || SecureDB.__expLedger) return
    SecureDB.__expLedger = true
    const origInsert = SecureDB.insert?.bind(SecureDB)
    if (!origInsert) return

    SecureDB.insert = async function (table, data) {
      const row = await origInsert(table, data)
      if (table === 'expenses' && data && !data._skipLedger) {
        try {
          const banks = (typeof DB !== 'undefined' ? DB.get('banks') : []) || []
          const bankId = data.bankId || banks[0]?.id || ''
          const catMap = {
            personnel: 'personnel',
            print: 'print',
            equipment: 'equipment',
            rent: 'rent',
            general: 'other',
            travel: 'other',
            marketing: 'other',
            food: 'other',
            maintenance: 'other'
          }
          const purposeCategory = catMap[data.category] || 'other'
          await origInsert('transactions', {
            type: 'withdrawal',
            amount: +(data.amount || 0),
            date: data.date || (typeof Utils !== 'undefined' ? Utils.todayJalali() : ''),
            periodMonth: data.periodMonth || '',
            bankId,
            sourceType:
              purposeCategory === 'personnel'
                ? 'personnel'
                : purposeCategory === 'print'
                  ? 'customer'
                  : 'other',
            contractId: data.contractId || '',
            personnelId: data.personnelId || '',
            client: data.client || data.title || '',
            purposeCategory,
            purpose: data.title || data.desc || 'هزینه جاری',
            notes: [data.notes || '', data.album ? 'آلبوم: ' + data.album : ''].filter(Boolean).join(' | '),
            desc: data.title || 'هزینه',
            expenseId: row?.id || '',
            fromExpensesModule: true
          })
          if (bankId && typeof FinanceSync !== 'undefined' && data.amount) {
            await FinanceSync.applyBankDelta(bankId, 'withdrawal', +data.amount)
          }
        } catch (e) {
          console.warn('[eng-complete] expense→ledger', e)
        }
      }
      return row
    }
  }

  /** نمایش نسخه در کنسول برای تأیید deploy */
  function stampVersion() {
    try {
      const v = w.AppConfig?.APP_VERSION || '?'
      const sw = w.AppConfig?.SW_CACHE || '?'
      console.info('[Mandani] v' + v + ' cache=' + sw + ' eng-complete=on')
      w.__MANDANI_BUILD__ = { version: v, sw, at: new Date().toISOString() }
    } catch { /* */ }
  }

  function boot() {
    patchLoginSync()
    patchExpensesToLedger()
    stampVersion()
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 500))
    } else setTimeout(boot, 500)
    setTimeout(boot, 2000)
  }

  w.EngRemainingComplete = { forceSyncPull, boot }
})(typeof window !== 'undefined' ? window : globalThis)
