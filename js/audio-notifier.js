/* ═════════════════════════════════════════════════════════════════
   Mandani Studio — Audio Notification & Sound Engine
   موتور صوتی بلادرنگ برای نوتیفیکیشن‌ها، پیام‌ها و رویدادهای قرارداد
   مبتنی بر Web Audio API بدون نیاز به دانلود فایل خارجی و با کیفیت بالا
   ═════════════════════════════════════════════════════════════════ */

const AudioNotifier = {
  _ctx: null,
  _enabled: true,

  init() {
    try {
      const stored = localStorage.getItem('mandani_sound_enabled')
      this._enabled = stored !== null ? stored === 'true' : true
    } catch {
      this._enabled = true
    }

    // باز کردن قفل AudioContext در اولین تعامل کاربر (Touch / Click / Key)
    const unlock = () => {
      this._getContext()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('pointerdown', unlock, { passive: true })
    window.addEventListener('keydown', unlock, { passive: true })
    window.addEventListener('touchstart', unlock, { passive: true })
  },

  _getContext() {
    if (typeof window === 'undefined') return null
    if (!this._ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        this._ctx = new AudioCtx()
      }
    }
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {})
    }
    return this._ctx
  },

  isEnabled() {
    return this._enabled
  },

  toggleSound() {
    this._enabled = !this._enabled
    try {
      localStorage.setItem('mandani_sound_enabled', this._enabled ? 'true' : 'false')
    } catch { /* */ }
    if (this._enabled) {
      this.playSent()
    }
    this._updateButtons()
    return this._enabled
  },

  setSound(enabled) {
    this._enabled = !!enabled
    try {
      localStorage.setItem('mandani_sound_enabled', this._enabled ? 'true' : 'false')
    } catch { /* */ }
    this._updateButtons()
  },

  _updateButtons() {
    document.querySelectorAll('.audio-notifier-toggle').forEach(btn => {
      btn.innerHTML = this._enabled 
        ? '<i class="fas fa-volume-high" style="color:#f59e0b"></i>' 
        : '<i class="fas fa-volume-xmark" style="color:rgba(255,255,255,0.4)"></i>'
      btn.title = this._enabled ? 'صدای اعلان‌ها فعال است (کلیک برای بی‌صدا)' : 'صدای اعلان‌ها خاموش است (کلیک برای فعال‌سازی)'
    })
  },

  /**
   * صدای ملایم و لوکس دریافت پیام جدید (Dual Bell Chime - C6 -> G6)
   */
  playIncoming() {
    if (!this._enabled) return
    const ctx = this._getContext()
    if (!ctx) return

    try {
      const now = ctx.currentTime

      // نوت اول (523.25 Hz - C5)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now) // D5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.08) // E5

      gain1.gain.setValueAtTime(0.001, now)
      gain1.gain.exponentialRampToValueAtTime(0.22, now + 0.02)
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)

      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.35)

      // نوت دوم هارمونیک اکو دار (880 Hz - A5)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(880, now + 0.1)

      gain2.gain.setValueAtTime(0.001, now + 0.1)
      gain2.gain.exponentialRampToValueAtTime(0.26, now + 0.12)
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.65)

      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.1)
      osc2.stop(now + 0.68)
    } catch (e) {
      console.warn('[AudioNotifier] Incoming sound error:', e)
    }
  },

  /**
   * صدای تأیید ارسال پیام (Soft pop/tick - 800Hz)
   */
  playSent() {
    if (!this._enabled) return
    const ctx = this._getContext()
    if (!ctx) return

    try {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(740, now)
      osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.06)

      gain.gain.setValueAtTime(0.001, now)
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.16)
    } catch (e) {
      console.warn('[AudioNotifier] Sent sound error:', e)
    }
  },

  /**
   * صدای فاخر مبادله و ارسال اطلاعات قرارداد (Cinematic 3-Chord Arpeggio)
   */
  playContract() {
    if (!this._enabled) return
    const ctx = this._getContext()
    if (!ctx) return

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
      const now = ctx.currentTime

      notes.forEach((freq, idx) => {
        const start = now + (idx * 0.075)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, start)

        gain.gain.setValueAtTime(0.001, start)
        gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.48)
      })
    } catch (e) {
      console.warn('[AudioNotifier] Contract sound error:', e)
    }
  },

  /**
   * رندر دکمه کنترل صدا برای قرارگیری در هدر یا نوار چت
   */
  renderToggleButton(cls = '') {
    const isEn = this.isEnabled()
    return `<button type="button" class="audio-notifier-toggle ${cls}" onclick="AudioNotifier.toggleSound()" 
      style="background:transparent;border:none;cursor:pointer;padding:4px 8px;font-size:14px;display:inline-flex;align-items:center;justify-content:center;transition:transform .15s"
      title="${isEn ? 'صدای اعلان‌ها فعال است (کلیک برای بی‌صدا)' : 'صدای اعلان‌ها خاموش است (کلیک برای فعال‌سازی)'}">
      ${isEn ? '<i class="fas fa-volume-high" style="color:#f59e0b"></i>' : '<i class="fas fa-volume-xmark" style="color:rgba(255,255,255,0.4)"></i>'}
    </button>`
  }
}

if (typeof window !== 'undefined') {
  AudioNotifier.init()
  window.AudioNotifier = AudioNotifier
}
