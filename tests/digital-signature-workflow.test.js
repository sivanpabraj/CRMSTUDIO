import { describe, it, expect } from 'vitest'

describe('Digital Signatures & Cryptographic Hashing', () => {
  async function generateSignatureHash(dataUrl, meta = {}) {
    const payload = JSON.stringify({
      data: dataUrl,
      contractId: meta.contractId || '',
      phone: meta.phone || '',
      timestamp: meta.timestamp || 1700000000000
    })
    const enc = new TextEncoder()
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(payload))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  it('generates consistent 64-character SHA-256 hash for signature proof', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
    const hash1 = await generateSignatureHash(dataUrl, { contractId: 'c101', phone: '09121111111' })
    const hash2 = await generateSignatureHash(dataUrl, { contractId: 'c101', phone: '09121111111' })
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/)
  })

  it('generates distinct hash if signature data or metadata changes', async () => {
    const h1 = await generateSignatureHash('data:image/png;base64,SIG_1', { contractId: 'c1' })
    const h2 = await generateSignatureHash('data:image/png;base64,SIG_2', { contractId: 'c1' })
    expect(h1).not.toBe(h2)
  })
})

describe('Production Workflow & Kanban Pipeline Progression', () => {
  const STAGES = ['ingest', 'cull', 'edit', 'color', 'review', 'delivery']

  function calcProgress(stage, isCompleted) {
    if (isCompleted) return 100
    const idx = STAGES.indexOf(stage || 'ingest')
    if (idx < 0) return 0
    return Math.round((idx / (STAGES.length - 1)) * 100)
  }

  function advanceWorkflow(item) {
    const idx = STAGES.indexOf(item.stage || 'ingest')
    if (idx >= STAGES.length - 1) {
      return { ...item, status: 'completed', progress: 100 }
    }
    const nextStage = STAGES[idx + 1]
    const isDelivery = nextStage === 'delivery'
    return {
      ...item,
      stage: nextStage,
      status: isDelivery ? 'completed' : 'active',
      progress: calcProgress(nextStage, isDelivery)
    }
  }

  function revertWorkflow(item) {
    const idx = STAGES.indexOf(item.stage || 'ingest')
    if (idx <= 0) return item
    const prevStage = STAGES[idx - 1]
    return {
      ...item,
      stage: prevStage,
      status: 'active',
      progress: calcProgress(prevStage, false)
    }
  }

  it('calculates progress percentage correctly across all 6 stages', () => {
    expect(calcProgress('ingest', false)).toBe(0)
    expect(calcProgress('edit', false)).toBe(40)
    expect(calcProgress('color', false)).toBe(60)
    expect(calcProgress('review', false)).toBe(80)
    expect(calcProgress('delivery', true)).toBe(100)
  })

  it('advances stages sequentially until completion', () => {
    let item = { id: 'wf1', stage: 'ingest', status: 'active', progress: 0 }
    item = advanceWorkflow(item)
    expect(item.stage).toBe('cull')
    expect(item.progress).toBe(20)

    item = advanceWorkflow(item)
    expect(item.stage).toBe('edit')

    item = advanceWorkflow(item)
    expect(item.stage).toBe('color')

    item = advanceWorkflow(item)
    expect(item.stage).toBe('review')

    item = advanceWorkflow(item)
    expect(item.stage).toBe('delivery')
    expect(item.status).toBe('completed')
    expect(item.progress).toBe(100)
  })

  it('reverts stages correctly but does not go before ingest', () => {
    let item = { id: 'wf1', stage: 'color', status: 'active' }
    item = revertWorkflow(item)
    expect(item.stage).toBe('edit')

    item = revertWorkflow(item)
    expect(item.stage).toBe('cull')

    item = revertWorkflow(item)
    expect(item.stage).toBe('ingest')

    item = revertWorkflow(item)
    expect(item.stage).toBe('ingest') // stays at first stage
  })
})

describe('Project Profitability & Financial Metrics', () => {
  it('accurately computes net profit and profit margin for studio contracts', () => {
    const contractTotal = 50000000 // 50M Tomans
    const staffWages = 12000000    // 12M (photographers + editors)
    const printOrders = 6000000    // 6M (albums & prints)
    const expenses = 4000000       // 4M (location & overhead)

    const totalCosts = staffWages + printOrders + expenses
    const netProfit = contractTotal - totalCosts
    const profitMargin = Math.round((netProfit / contractTotal) * 100)

    expect(netProfit).toBe(28000000)
    expect(profitMargin).toBe(56) // 56% profit margin
  })
})
