/** Offline export boundary. Foreign runtime scripts are forbidden. */
const SMExport = {
  ensurePdfLibs() {
    if (typeof html2pdf !== 'undefined' && typeof html2canvas !== 'undefined') {
      return Promise.resolve()
    }
    return Promise.resolve(false)
  }
}

if (typeof window !== 'undefined') window.SMExport = SMExport
