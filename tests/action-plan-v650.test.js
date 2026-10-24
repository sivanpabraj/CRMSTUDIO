import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const swSource = fs.readFileSync('sw.js', 'utf8')
const appSource = fs.readFileSync('js/app.js', 'utf8')
const onlineBookingSource = fs.readFileSync('js/online-booking.js', 'utf8')
const crewPwaSource = fs.readFileSync('js/crew-pwa.js', 'utf8')

describe('Engineering Action Plan v6.5.0 — Core Updates & Bug Fixes', () => {
  it('Service Worker v48 contains all critical shell URLs including booking, invoice, and landing', () => {
    expect(swSource).toContain("'./booking.html'")
    expect(swSource).toContain("'./invoice.html'")
    expect(swSource).toContain("'./landing.html'")
  })

  it('Service Worker activate event clears caches with mandani-studio- prefix', () => {
    expect(swSource).toContain("k.startsWith('mandani-studio-')")
    expect(swSource).toContain("k.startsWith('studio-erp-')")
  })

  it('Portal.renderAuth gracefully guards against null portal-app element without throwing TypeError', () => {
    const context = {
      window: {},
      document: {
        getElementById: (id) => (id === 'portal-app' ? null : {}),
        readyState: 'complete',
        addEventListener: vi.fn()
      },
      console,
      Date,
      Math,
      String,
      location: { search: '', hash: '' }
    }
    context.window = context
    vm.createContext(context)

    // Should not throw TypeError even when portal-app is missing
    expect(() => {
      vm.runInContext(appSource, context)
    }).not.toThrow()
  })

  it('OnlineBooking.submitBooking attempts online server dispatch to /api/public/booking and falls back to local DB', async () => {
    let apiEndpointCalled = ''
    let sentPayload = null

    const mockFetch = vi.fn(async (url, opts) => {
      apiEndpointCalled = url
      sentPayload = JSON.parse(opts.body)
      return {
        ok: true,
        json: async () => ({
          ok: true,
          booking: { id: 'srv_bk_9988' },
          code: 'BK-1405-SRV9'
        })
      }
    })

    const store = { bookings: [], leads: [] }
    const context = {
      window: {},
      fetch: mockFetch,
      console,
      Date,
      Math,
      parseInt,
      Number,
      String,
      Array,
      Object,
      Utils: {
        todayJalali: () => '1405/04/20',
        isValidPhone: (p) => /^09\d{9}$/.test(p.trim()),
        normalizePhone: (p) => p.trim()
      },
      DB: {
        get: (k) => store[k] || [],
        insert: (k, item) => {
          if (!store[k]) store[k] = []
          store[k].push(item)
          return item
        },
        log: vi.fn()
      },
      SecureDB: {
        insert: async (k, item) => {
          if (!store[k]) store[k] = []
          store[k].push(item)
          return item
        }
      }
    }
    context.window = context
    vm.createContext(context)
    vm.runInContext(onlineBookingSource, context)

    const ob = context.OnlineBooking
    const res = await ob.submitBooking({
      branchId: 'wedding',
      packageId: 'pkg_wed_standard',
      date: '1405/04/25',
      slotId: 'golden_hour',
      clientName: 'مهسا احمدی',
      clientPhone: '09183332211',
      city: 'مریوان',
      deposit: 3000000
    })

    expect(res.ok).toBe(true)
    expect(apiEndpointCalled).toBe('/api/public/booking')
    expect(sentPayload.clientName).toBe('مهسا احمدی')
    expect(res.booking.code).toBe('BK-1405-SRV9')
    expect(res.booking.id).toBe('srv_bk_9988')
    expect(store.bookings.length).toBe(1)
  })

  it('CrewHub provides clean user authentication and logout method', () => {
    let replacedUrl = ''
    const sessionStore = new Map()

    const context = {
      window: {
        location: {
          replace: (url) => {
            replacedUrl = url
          }
        }
      },
      location: {
        replace: (url) => {
          replacedUrl = url
        }
      },
      sessionStorage: {
        getItem: (k) => sessionStore.get(k) || null,
        setItem: (k, v) => sessionStore.set(k, v),
        removeItem: (k) => sessionStore.delete(k)
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      document: {
        getElementById: () => null,
        querySelectorAll: () => [],
        addEventListener: vi.fn()
      },
      console,
      Date,
      Math,
      String,
      Auth: {
        getUser: () => ({ name: 'سارا صادقی', role: 'عکاس کودک و نوزاد', phone: '09181119988' }),
        logout: vi.fn()
      }
    }
    context.window = context
    vm.createContext(context)
    vm.runInContext(crewPwaSource, context)

    const ch = context.window.CrewHub
    expect(ch).toBeDefined()
    expect(ch.logout).toBeTypeOf('function')

    ch.loadUser()
    expect(ch.state.currentUser.name).toBe('سارا صادقی')
    expect(ch.state.currentUser.role).toBe('عکاس کودک و نوزاد')

    ch.logout()
    expect(context.Auth.logout).toHaveBeenCalled()
    expect(replacedUrl).toBe('index.html')
  })
})
