/* ══════════════════════════════════════════════
   MAN — Demo Seed Data (فقط با ?demo=1)
   ══════════════════════════════════════════════ */

const DemoSeed = {
  KEY: 'man_demo_seeded_v1',
  _adminPassword: '',
  get ADMIN_PASSWORD() {
    if (!this._adminPassword) this._adminPassword = Utils.generateRandomPassword(16)
    return this._adminPassword
  },

  isDemoMode() {
    if (!AppConfig.isLocalDev()) return false
    return Utils.storage.get('man_demo_mode', false) || location.search.includes('demo=1')
  },

  /** نمونه درخواست عضویت در انتظار تأیید مدیر (فقط دمو) */
  async ensurePendingSignup() {
    if (!this.isDemoMode()) return
    const phone = '09125555555'
    if (DB.find('users', u => Utils.normalizePhone(u.phone) === phone)) return
    const creds = await Auth.hashCredentials(this.ADMIN_PASSWORD)
    await SecureDB.insert('users', {
      name: 'سارا تدوین‌گر',
      phone,
      password: creds.password,
      salt: creds.salt,
      roles: [],
      status: 'pending',
      avatar: 'س',
      createdAt: Utils.todayJalali()
    })
    await SecureDB.insert('notifications', {
      type: 'alert',
      title: '👥 درخواست عضویت همکار جدید',
      text: 'سارا تدوین‌گر — 09125555555 — در انتظار تأیید مدیر',
      read: false,
      createdAt: Utils.todayJalali()
    })
  },

  async ensureQueueForDemo() {
    if (!this.isDemoMode()) return
    const c0001 = DB.find('contracts', c => String(c.contractNum).padStart(4, '0') === '0001')
    if (!c0001) return

    const mkDelivery = (daysFromNow) => {
      const d = new Date()
      d.setDate(d.getDate() + daysFromNow)
      const [jy, jm, jd] = Utils.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
      return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
    }
    const queueNames = [
      { groom: 'رضا', bride: 'مریم', num: '0002', days: 3 },
      { groom: 'حسین', bride: 'زهرا', num: '0003', days: 4 },
      { groom: 'محمد', bride: 'فاطمه', num: '0004', days: 5 },
      { groom: 'امیر', bride: 'سارا', num: '0005', days: 6 },
      { groom: 'پویا', bride: 'نرگس', num: '0006', days: 7 }
    ]
    for (const q of queueNames) {
      if (DB.get('contracts').some(c => c.contractNum === q.num)) continue
      await SecureDB.insert('contracts', {
        contractNum: q.num, groom: q.groom, bride: q.bride,
        groomPhone: '09120000000', bridePhone: '09120000001',
        eventDate: Utils.todayJalali(), venue: 'تالار',
        deliveryDate: mkDelivery(q.days), total: 30000000, deposit: 5000000,
        status: 'active', createdAt: Utils.todayJalali()
      })
    }

    if (typeof PhotoHouse !== 'undefined' && !DB.get('photoSelections').some(s => s.contractId === c0001.id)) {
      PhotoHouse.upsertPhotoSelection({
        contractId: c0001.id, contractNum: '0001', couple: 'بیتا و علی',
        maxPhotos: 30,
        notes: 'لطفاً شماره عکس‌های مورد نظر برای آلبوم را وارد نمایید.'
      })
    }

    if (!DB.get('printShops').length) {
      await SecureDB.insert('printShops', {
        name: 'چاپخانه رویال (دمو)', card: '',
        shaba: '', phone: '', address: 'نشانی نمونه'
      })
    }

    if (!DB.get('albums').some(a => a.contractId === c0001.id)) {
      await SecureDB.insert('albums', {
        contractId: c0001.id, contractNum: '0001', couple: 'بیتا و علی',
        title: 'آلبوم ۳۰×۳۰ جلد چرم',
        items: [{ name: 'آلبوم ۳۰×۳۰ جلد چرم', qty: 1, unitPrice: 8500000, total: 8500000 }],
        totalAmount: 8500000, maxPhotos: 30, selectedPhotos: [],
        status: 'selection', notes: 'نمونه — در انتظار انتخاب مشتری',
        createdAt: Utils.todayJalali()
      })
    }

    const photographer = DB.findPersonnelByPhone('09122222222')
    if (photographer && !DB.filter('persProjects', p => p.contractId === c0001.id && p.roleId === 'photographer').length) {
      await SecureDB.insert('persProjects', {
        contractId: c0001.id,
        personnelId: photographer.id,
        personnelName: photographer.name,
        personnelPhone: photographer.phone,
        role: 'عکاس تالار', roleId: 'photographer',
        couple: 'بیتا و علی', eventDate: c0001.eventDate,
        venue: c0001.venue, amount: 3000000,
        status: 'active', accepted: true, paid: 0,
        deadline: c0001.deliveryDate, notes: '', createdAt: Utils.todayJalali()
      })
    }
  },

  async seed() {
    if (!this.isDemoMode()) return false

    if (typeof FirstSetup !== 'undefined') await FirstSetup.ensureFirstAdmin()

    if (DB.get('contracts').some(c => c.contractNum === '0001')) {
      await this.ensureQueueForDemo()
      await this.ensurePendingSignup()
      Utils.storage.set(this.KEY, true)
      return false
    }
    if (Utils.storage.get(this.KEY) && DB.get('users').find(u => u.phone === '09121111111')) {
      await this.ensurePendingSignup()
      return false
    }

    const creds = await Auth.hashCredentials(this.ADMIN_PASSWORD)

    const editor = await SecureDB.insert('users', {
      name: 'رضا تدوین‌گر', phone: '09121111111',
      password: creds.password, salt: creds.salt,
      roles: ['editor_clip'], status: 'active',
      avatar: 'ر', createdAt: Utils.todayJalali()
    })
    DB.syncPersonnelFromUser(editor)
    const editorPerson = DB.findPersonnelByPhone('09121111111')

    await SecureDB.insert('users', {
      name: 'امیر عکاس', phone: '09122222222',
      password: creds.password, salt: creds.salt,
      roles: ['photographer'], status: 'active',
      avatar: 'ا', createdAt: Utils.todayJalali()
    })
    DB.syncPersonnelFromUser(DB.find('users', u => u.phone === '09122222222'))

    const deliveryDate = (() => {
      const d = new Date()
      d.setDate(d.getDate() + 12)
      const [jy, jm, jd] = Utils.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
      return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
    })()

    const mkDelivery = (daysFromNow) => {
      const d = new Date()
      d.setDate(d.getDate() + daysFromNow)
      const [jy, jm, jd] = Utils.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
      return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
    }

    const queueNames = [
      { groom: 'رضا', bride: 'مریم', num: '0002', days: 3 },
      { groom: 'حسین', bride: 'زهرا', num: '0003', days: 4 },
      { groom: 'محمد', bride: 'فاطمه', num: '0004', days: 5 },
      { groom: 'امیر', bride: 'سارا', num: '0005', days: 6 },
      { groom: 'پویا', bride: 'نرگس', num: '0006', days: 7 }
    ]
    for (const q of queueNames) {
      await SecureDB.insert('contracts', {
        contractNum: q.num,
        groom: q.groom, bride: q.bride,
        groomPhone: '09120000000', bridePhone: '09120000001',
        eventDate: Utils.todayJalali(),
        venue: 'تالار',
        deliveryDate: mkDelivery(q.days),
        total: 30000000, deposit: 5000000,
        status: 'active',
        createdAt: Utils.todayJalali()
      })
    }

    const contract = await SecureDB.insert('contracts', {
      contractNum: '0001',
      groom: 'علی', bride: 'بیتا',
      groomPhone: '09123333333', bridePhone: '09124444444',
      eventDate: Utils.todayJalali(),
      venue: 'تالار رویال',
      deliveryDate,
      total: 50000000, deposit: 10000000,
      status: 'active',
      createdAt: Utils.todayJalali()
    })

    if (editorPerson) {
      await SecureDB.insert('persProjects', {
        contractId: contract.id,
        personnelId: editorPerson.id,
        personnelName: editorPerson.name,
        personnelPhone: editorPerson.phone,
        role: 'تدوین‌گر کلیپ', roleId: 'editor_clip',
        couple: 'بیتا و علی', eventDate: contract.eventDate,
        venue: contract.venue, amount: 5000000,
        status: 'active', accepted: true, paid: 0,
        deadline: deliveryDate, notes: '', createdAt: Utils.todayJalali()
      })
    }

    Utils.storage.set(this.KEY, true)
    Utils.storage.set('man_demo_mode', true)
    await this.ensureQueueForDemo()
    await this.ensurePendingSignup()
    await DB.flush()
    if (AppConfig.isLocalDev()) {
      const manager = DB.find('users', user => (user.roles || []).includes('studio_manager'))
      console.info('[Demo] مدیر: ' + (manager?.phone || 'ساخته نشده') + ' / رمز یک‌بارمصرف راه‌اندازی')
      console.info('[Demo] مشتری: قرارداد 0001 / 09123333333')
      console.info('[Demo] پرسنل نمونه: 09121111111 / رمز تصادفی نشست دمو')
    }
    return true
  }
}

window.DemoSeed = DemoSeed
