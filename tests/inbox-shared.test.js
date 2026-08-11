import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('InboxShared', () => {
  let rows

  beforeEach(async () => {
    vi.resetModules()
    rows = [{
      id: 'req-1',
      thread: [{ id: 'm-1', author: 'customer', text: 'سلام', readBy: ['customer'] }]
    }]
    vi.stubGlobal('window', {})
    vi.stubGlobal('Utils', {
      todayJalali: () => '۱۴۰۵/۰۵/۲۰',
      parseJalali: () => null
    })
    vi.stubGlobal('DB', {
      find: (_collection, predicate) => rows.find(predicate),
      update: (_collection, id, patch) => {
        const index = rows.findIndex(row => row.id === id)
        rows[index] = { ...rows[index], ...patch }
      }
    })
    await import('../js/inbox-shared.js')
  })

  it('tracks unread messages independently for customer and studio', () => {
    expect(window.InboxShared.unreadFor(rows[0], 'manager')).toBe(1)
    expect(window.InboxShared.unreadFor(rows[0], 'customer')).toBe(0)

    expect(window.InboxShared.markRead('req-1', 'manager')).toBe(1)
    expect(rows[0].thread[0].readBy).toContain('manager')
    expect(window.InboxShared.unreadFor(rows[0], 'manager')).toBe(0)
  })

  it('adds reply metadata and sender receipt without mutating older entries', () => {
    const first = rows[0].thread[0]
    const reply = window.InboxShared.appendThread('req-1', {
      author: 'manager',
      text: 'پاسخ',
      replyTo: 'm-1'
    })

    expect(reply.replyTo).toBe('m-1')
    expect(reply.readBy).toEqual(['manager'])
    expect(rows[0].thread).toHaveLength(2)
    expect(first).toEqual({ id: 'm-1', author: 'customer', text: 'سلام', readBy: ['customer'] })
  })
})
