import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('DispatchHub & 3-Way Notification Channels Engine', () => {
  let DispatchHub

  beforeEach(() => {
    global.window = {
      location: { origin: 'http://studiomandani.ir' },
      open: () => {}
    }
    global.DB = {
      get: (key) => {
        if (key === 'studioInfo') {
          return { name: 'استودیو فیلم و عکس ماندنی', joinCode: 'MND-7821', phone: '09187766554' }
        }
        return []
      },
      find: (col, fn) => null
    }

    const code = fs.readFileSync(path.resolve(__dirname, '../js/dispatch-hub.js'), 'utf8')
    const fn = new Function('global', 'window', 'DB', `${code}; return DispatchHub;`)
    DispatchHub = fn(global, global.window, global.DB)
  })

  it('builds formatted share content with couple, contract number and portal link', () => {
    const contract = {
      id: 'c-1042',
      contractNum: '1042',
      couple: 'سارا و آرمان',
      eventDate: '1403/08/15',
      total: 35000000,
      deposit: 10000000
    }

    const content = DispatchHub.buildContractShareContent(contract)
    expect(content.couple).toBe('سارا و آرمان')
    expect(content.num).toBe('1042')
    expect(content.remaining).toBe(25000000)
    expect(content.text).toContain('استودیو فیلم و عکس ماندنی')
    expect(content.text).toContain('سارا و آرمان')
    expect(content.text).toContain('1042')
    expect(content.text).toContain('customer.html?contract=c-1042')
    expect(content.portalUrl).toContain('http://studiomandani.ir/app/customer.html?contract=c-1042')
  })

  it('generates rich luxury HTML email with studio brand and action button', () => {
    const contract = {
      id: 'c-1042',
      contractNum: '1042',
      couple: 'سارا و آرمان',
      eventDate: '1403/08/15',
      total: 35000000,
      deposit: 10000000
    }

    const html = DispatchHub.buildContractEmailHtml(contract)
    expect(html).toContain('استودیو فیلم و عکس ماندنی')
    expect(html).toContain('سارا و آرمان')
    expect(html).toContain('مشاهده و امضای آنلاین قرارداد')
    expect(html).toContain('customer.html?contract=c-1042')
  })
})
