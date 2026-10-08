/**
 * CRMSTUDIO — Touch & Draw Digital Signature Engine
 * ماژول رسمی امضای دیجیتال لمسی با بوم Canvas و ثبت هش امنیتی SHA-256
 */

(function (window) {
  'use strict'

  const SignaturePad = {
    /**
     * محاسبات هش امنیتی SHA-256 از روی تصویر امضا و متادیتا
     */
    async generateHash(dataUrl, meta = {}) {
      try {
        const payload = JSON.stringify({
          data: dataUrl,
          contractId: meta.contractId || '',
          phone: meta.phone || '',
          timestamp: meta.timestamp || Date.now()
        })
        const enc = new TextEncoder()
        const buf = await crypto.subtle.digest('SHA-256', enc.encode(payload))
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
      } catch {
        return 'sig_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      }
    },

    /**
     * اتصال رفتار رسم به بوم Canvas
     */
    bindCanvas(canvas) {
      if (!canvas) return null
      const ctx = canvas.getContext('2d')
      let isDrawing = false
      let lastX = 0
      let lastY = 0
      let pointsCount = 0

      // بهینه‌سازی وضوح رتینا
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = (rect.width || 360) * dpr
      canvas.height = (rect.height || 180) * dpr
      ctx.scale(dpr, dpr)

      ctx.strokeStyle = '#1D1D1F'
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      function getPos(e) {
        const r = canvas.getBoundingClientRect()
        const clientX = e.touches ? e.touches[0].clientX : e.clientX
        const clientY = e.touches ? e.touches[0].clientY : e.clientY
        return {
          x: clientX - r.left,
          y: clientY - r.top
        }
      }

      function start(e) {
        if (e.cancelable) e.preventDefault()
        isDrawing = true
        const pos = getPos(e)
        lastX = pos.x
        lastY = pos.y
        ctx.beginPath()
        ctx.moveTo(lastX, lastY)
      }

      function draw(e) {
        if (!isDrawing) return
        if (e.cancelable) e.preventDefault()
        const pos = getPos(e)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
        lastX = pos.x
        lastY = pos.y
        pointsCount++
      }

      function stop() {
        if (isDrawing) {
          isDrawing = false
          ctx.closePath()
        }
      }

      canvas.addEventListener('mousedown', start)
      window.addEventListener('mousemove', draw)
      window.addEventListener('mouseup', stop)

      canvas.addEventListener('touchstart', start, { passive: false })
      canvas.addEventListener('touchmove', draw, { passive: false })
      window.addEventListener('touchend', stop)

      return {
        clear() {
          ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
          pointsCount = 0
        },
        isEmpty() {
          return pointsCount < 5
        },
        toDataURL() {
          return canvas.toDataURL('image/png')
        }
      }
    },

    /**
     * باز کردن مدال اختصاصی امضای لمسی برای مشتری یا استودیو
     */
    openModal(opts = {}) {
      const {
        title = 'امضای دیجیتال رسمی',
        role = 'client', // 'groom' | 'bride' | 'manager' | 'client'
        signerName = '',
        signerPhone = '',
        contractId = '',
        contractNum = '',
        onSigned = null
      } = opts

      const modalId = 'sig-modal-' + Date.now()
      const overlay = document.createElement('div')
      overlay.id = modalId
      overlay.className = 'sm-modal-backdrop'
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(10px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;'

      overlay.innerHTML = `
        <div class="sm-card" style="width:100%;max-width:480px;background:var(--sm-surface, #1e1e24);border:1px solid var(--sm-border, rgba(255,255,255,0.1));box-shadow:0 24px 60px rgba(0,0,0,0.5);border-radius:20px;overflow:hidden;direction:rtl">
          <div style="padding:18px 22px;border-bottom:1px solid var(--sm-border, rgba(255,255,255,0.08));display:flex;justify-content:space-between;align-items:center">
            <div>
              <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:var(--sm-text, #fff)"><i class="fas fa-signature" style="color:var(--sm-accent, #0071E3);margin-left:8px"></i>${title}</h3>
              <p style="margin:4px 0 0;font-size:.78rem;color:var(--sm-text-muted, #8e8e93)">${signerName ? `امضاکننده: <strong>${signerName}</strong>` : ''} ${contractNum ? `· قرارداد #${contractNum}` : ''}</p>
            </div>
            <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" id="sig-close-btn" style="border:none;background:transparent;color:var(--sm-text-muted, #aaa);font-size:1.1rem;cursor:pointer">✕</button>
          </div>
          
          <div style="padding:20px 22px">
            <p style="font-size:.82rem;color:var(--sm-text-muted, #aaa);margin:0 0 12px">لطفاً امضای خود را با انگشت یا قلم در کادر زیر رسم نمایید:</p>
            <div style="background:#ffffff;border-radius:14px;border:2px dashed #d1d1d6;overflow:hidden;position:relative;height:200px;touch-action:none">
              <canvas id="sig-canvas" style="width:100%;height:100%;display:block;cursor:crosshair"></canvas>
              <div style="position:absolute;bottom:8px;right:12px;font-size:.7rem;color:#8e8e93;pointer-events:none">محل امضای رسمی</div>
            </div>
            
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
              <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" id="sig-clear-btn" style="font-size:.78rem">
                <i class="fas fa-rotate-left"></i> پاک‌کردن و رسم مجدد
              </button>
              <span style="font-size:.72rem;color:var(--sm-text-muted, #888)"><i class="fas fa-shield-halved"></i> ثبت با استاندارد رمزنگاری SHA-256</span>
            </div>
          </div>

          <div style="padding:16px 22px;border-top:1px solid var(--sm-border, rgba(255,255,255,0.08));display:flex;justify-content:flex-end;gap:10px;background:var(--sm-surface-2, rgba(255,255,255,0.02))">
            <button type="button" class="sm-btn sm-btn-ghost" id="sig-cancel-btn">انصراف</button>
            <button type="button" class="sm-btn sm-btn-primary" id="sig-submit-btn" style="min-width:120px">
              <i class="fas fa-check"></i> تأیید و ثبت امضا
            </button>
          </div>
        </div>
      `

      document.body.appendChild(overlay)
      const canvasEl = document.getElementById('sig-canvas')
      const pad = this.bindCanvas(canvasEl)

      function close() {
        overlay.remove()
      }

      document.getElementById('sig-close-btn').onclick = close
      document.getElementById('sig-cancel-btn').onclick = close
      document.getElementById('sig-clear-btn').onclick = () => pad.clear()

      document.getElementById('sig-submit-btn').onclick = async () => {
        if (pad.isEmpty()) {
          if (typeof window.SM !== 'undefined' && window.SM.toast) {
            window.SM.toast('لطفاً ابتدا امضای خود را در کادر رسم کنید', 'warning')
          } else if (typeof window.Utils !== 'undefined' && window.Utils.toast) {
            window.Utils.toast('لطفاً ابتدا امضای خود را در کادر رسم کنید', 'warning')
          } else {
            alert('لطفاً ابتدا امضای خود را در کادر رسم کنید')
          }
          return
        }

        const dataUrl = pad.toDataURL()
        const now = typeof window.Utils !== 'undefined' ? window.Utils.todayJalali() : new Date().toLocaleDateString('fa-IR')
        const hash = await SignaturePad.generateHash(dataUrl, { contractId, phone: signerPhone, timestamp: Date.now() })

        const record = {
          id: 'sig_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          contractId: contractId || '',
          contractNum: contractNum || '',
          role: role || 'client',
          signerName: signerName || 'مشتری',
          signerPhone: signerPhone || '',
          signatureDataUrl: dataUrl,
          hash,
          signedAt: now,
          verified: true,
          status: 'valid',
          createdAt: new Date().toISOString()
        }

        // ذخیره در IndexedDB
        if (typeof window.SecureDB !== 'undefined' && window.SecureDB.insert) {
          await window.SecureDB.insert('signatures', record)
        } else if (typeof window.DB !== 'undefined' && window.DB.insert) {
          window.DB.insert('signatures', record)
        }

        if (typeof window.SM !== 'undefined' && window.SM.toast) {
          window.SM.toast('امضای دیجیتال با موفقیت ثبت و تأیید شد', 'success')
        } else if (typeof window.Utils !== 'undefined' && window.Utils.toast) {
          window.Utils.toast('امضای دیجیتال با موفقیت ثبت و تأیید شد', 'success')
        }

        close()
        if (typeof onSigned === 'function') {
          onSigned(record)
        }
      }
    }
  }

  window.SignaturePad = SignaturePad
})(typeof window !== 'undefined' ? window : globalThis)
