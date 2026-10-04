/**
 * PROPOSED MIGRATION STRATEGY: Single-Blob -> Store-Per-Collection (D1, D2 Architecture)
 * 
 * هدف معماری:
 * ۱. ارتقای نسخه ایندکس‌دی‌بی از ۱ به ۲ (indexedDB.open(name, 2))
 * ۲. ایجاد یک ObjectStore اختصاصی به ازای هر مجموعه به جای تک‌کلید studio_db_v5
 * ۳. انتقال خودکار داده‌های موجود در تراکنش onupgradeneeded بدون از دست رفتن رکوردها
 * ۴. پشتیبانی از ایندکس‌گذاری روی updatedAtIso جهت همگام‌سازی تفاضلی و tombstone
 */

export const MIGRATION_V2_SPEC = {
  dbName: 'talar_studio_v5',
  targetVersion: 2,
  
  // تعریف استورها
  stores: [
    { name: '_meta', options: { keyPath: 'key' } },
    { name: 'studioInfo', options: { keyPath: 'id' } },
    { name: 'securityState', options: { keyPath: 'id' } },
    // کالکشن‌های ردیف‌محور
    { 
      name: 'contracts', 
      options: { keyPath: 'id' }, 
      indices: [
        { name: 'updatedAtIso', keyPath: 'updatedAtIso' },
        { name: '_deleted', keyPath: '_deleted' },
        { name: 'phone', keyPath: 'phone' }
      ] 
    },
    { 
      name: 'transactions', 
      options: { keyPath: 'id' }, 
      indices: [
        { name: 'updatedAtIso', keyPath: 'updatedAtIso' },
        { name: 'contractId', keyPath: 'contractId' }
      ] 
    },
    { 
      name: 'invoices', 
      options: { keyPath: 'id' }, 
      indices: [{ name: 'updatedAtIso', keyPath: 'updatedAtIso' }] 
    },
    { 
      name: 'cheques', 
      options: { keyPath: 'id' }, 
      indices: [{ name: 'dueDate', keyPath: 'dueDate' }] 
    },
    { 
      name: 'banks', 
      options: { keyPath: 'id' } 
    },
    { 
      name: 'personnel', 
      options: { keyPath: 'id' },
      indices: [{ name: 'phone', keyPath: 'phone' }]
    }
    // سایر کالکشن‌ها به همین ترتیب افزوده می‌شوند
  ],

  /**
   * لاجیک پیشنهادی جهت اجرا در onupgradeneeded:
   */
  upgradeHandler(event) {
    const db = event.target.result
    const transaction = event.target.transaction

    // ۱. بررسی و خواندن blob قدیمی از استور main در صورت وجود
    if (db.objectStoreNames.contains('main')) {
      const oldStore = transaction.objectStore('main')
      const getReq = oldStore.get('studio_db_v5')
      
      getReq.onsuccess = () => {
        const oldBlob = getReq.result
        if (oldBlob && typeof oldBlob === 'object') {
          console.log('[Migration V2] داده‌های نسخه قدیمی کشف شد. توزیع به استورهای جدید...')
          // ۲. پخش داده‌ها به استورهای مجزا در همان تراکنش اتمیک
          for (const key of Object.keys(oldBlob)) {
            if (db.objectStoreNames.contains(key)) {
              const targetStore = transaction.objectStore(key)
              const val = oldBlob[key]
              if (Array.isArray(val)) {
                val.forEach(item => {
                  if (item && item.id) targetStore.put(item)
                })
              } else if (val && typeof val === 'object') {
                targetStore.put({ id: 'current', ...val })
              }
            }
          }
          console.log('[Migration V2] توزیع داده‌ها با موفقیت انجام شد.')
        }
      }
    }
  }
}
