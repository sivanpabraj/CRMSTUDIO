import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Messaging, Double Checkmarks & Contract Cards Engine', () => {
  let InboxShared

  beforeEach(() => {
    // Mock minimal environment
    global.window = {}
    global.document = { querySelectorAll: () => [] }
    global.localStorage = { getItem: () => null, setItem: () => {} }
    global.Utils = {
      todayJalali: () => '1403/07/13',
      fmtNum: (n) => String(n),
      escapeHtml: (s) => String(s || ''),
      parseJalali: () => ({ jm: 7, jd: 13 }),
      jalaliMonthName: () => 'مهر'
    }
    global.PortalShared = {
      PIPELINE_STAGES: {
        recording: { label: 'تصویربرداری و راش‌ها' },
        editing: { label: 'تدوین کلیپ و فیلم اصلی' }
      },
      REQUEST_TYPES: {
        mp3: { icon: '🎵', label: 'موزیک مراسم' },
        contract_info: { icon: '📋', label: 'اطلاعات قرارداد' }
      }
    }
    global.DB = {
      _data: { customerRequests: [], contracts: [], transactions: [] },
      find: (col, fn) => global.DB._data[col]?.find(fn),
      update: (col, id, patch) => {
        const item = global.DB._data[col]?.find(x => x.id === id)
        if (item) Object.assign(item, patch)
      },
      get: (col) => global.DB._data[col] || []
    }

    const code = fs.readFileSync(path.resolve(__dirname, '../js/inbox-shared.js'), 'utf8')
    const fn = new Function('global', 'window', 'Utils', 'PortalShared', 'DB', `${code}; return InboxShared;`)
    InboxShared = fn(global, global.window, global.Utils, global.PortalShared, global.DB)
  })

  it('generates double checkmarks for sender and distinguishes unread vs read', () => {
    const unreadEntry = {
      id: 't-1',
      author: 'customer',
      text: 'سلام، کار ما در چه مرحله‌ای است؟',
      status: 'delivered',
      readBy: { customer: true, manager: false, staff: false }
    }

    // Sender (customer) sees delivered double check
    const deliveredTicks = InboxShared.renderTicks(unreadEntry, 'customer')
    expect(deliveredTicks).toContain('chat-tick--delivered')
    expect(deliveredTicks).toContain('fa-check-double')

    // Recipient (manager) viewing incoming message does NOT see sender tick
    const recipientView = InboxShared.renderTicks(unreadEntry, 'manager')
    expect(recipientView).toBe('')

    // Once manager reads the message:
    const readEntry = {
      ...unreadEntry,
      readBy: { customer: true, manager: true, staff: false }
    }
    const readTicks = InboxShared.renderTicks(readEntry, 'customer')
    expect(readTicks).toContain('chat-tick--read')
    expect(readTicks).toContain('fa-check-double')
  })

  it('builds and renders contract snippet card correctly', () => {
    const contract = {
      id: 'c-101',
      contractNum: '1042',
      couple: 'سارا و علی',
      eventDate: '1403/08/15',
      finalAmount: 45000000,
      deposit: 15000000,
      stage: 'editing',
      items: [{ title: 'تصویربرداری دو دوربینه 4K' }]
    }

    const snippet = InboxShared.buildContractSnippet(contract)
    expect(snippet).toBeDefined()
    expect(snippet.contractNum).toBe('1042')
    expect(snippet.couple).toBe('سارا و علی')
    expect(snippet.totalAmount).toBe(45000000)
    expect(snippet.remaining).toBe(30000000)

    const cardHtml = InboxShared.renderContractCard(snippet)
    expect(cardHtml).toContain('خلاصه اطلاعات قرارداد #1042')
    expect(cardHtml).toContain('سارا و علی')
    expect(cardHtml).toContain('chat-contract-card')
  })

  it('marks thread as read when viewed by a specific role', () => {
    const req = {
      id: 'r-1',
      contractId: 'c-101',
      customerName: 'سارا و علی',
      read: false,
      thread: [
        {
          id: 't-1',
          author: 'customer',
          text: 'درخواست موزیک اختصاصی',
          readBy: { customer: true, manager: false }
        }
      ]
    }
    global.DB._data.customerRequests = [req]

    const changed = InboxShared.markThreadRead('r-1', 'manager')
    expect(changed).toBe(true)
    expect(req.thread[0].readBy.manager).toBe(true)
    expect(req.read).toBe(true)
  })
})
