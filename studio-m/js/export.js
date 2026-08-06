/**
 * Lazy-load PDF/export libraries only when needed (receipts / reports).
 */
const SMExport = {
  _loading: null,

  ensurePdfLibs() {
    if (typeof html2pdf !== 'undefined' && typeof html2canvas !== 'undefined') {
      return Promise.resolve()
    }
    if (this._loading) return this._loading
    this._loading = Promise.all([
      this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
      this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js')
    ]).finally(() => { this._loading = null })
    return this._loading
  },

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) {
        resolve()
        return
      }
      const el = document.createElement('script')
      el.src = src
      el.async = true
      el.onload = () => resolve()
      el.onerror = () => reject(new Error(`failed to load ${src}`))
      document.head.appendChild(el)
    })
  }
}

if (typeof window !== 'undefined') window.SMExport = SMExport
