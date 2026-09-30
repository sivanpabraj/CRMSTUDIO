/* Luxury Studio Ambient Canvas (Cinema Bokeh & Lens Warmth) */
const AuthAmbient = {
  frame: 0,
  canvas: null,
  context: null,
  bokeh: [],
  dust: [],

  mount() {
    const canvas = document.querySelector('[data-auth-ambient]')
    if (!canvas || canvas === this.canvas) return
    this.destroy()
    this.canvas = canvas
    this.context = canvas.getContext('2d', { alpha: true })
    if (!this.context || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    this.resize()

    // Luxury Camera Aperture Bokeh Discs (Warm Gold, Amber, Subtle Indigo)
    this.bokeh = Array.from({ length: 14 }, (_, i) => ({
      x: 0.08 + Math.random() * 0.84,
      y: 0.08 + Math.random() * 0.84,
      radius: 45 + Math.random() * 95,
      baseAlpha: 0.035 + Math.random() * 0.045,
      speedX: (Math.random() - 0.5) * 0.00006,
      speedY: (Math.random() - 0.5) * 0.00006,
      phase: i * 0.5,
      color: i % 3 === 0 ? '245, 158, 11' : (i % 3 === 1 ? '217, 119, 6' : '99, 102, 241')
    }))

    // Fine Floating Star Dust
    this.dust = Array.from({ length: 28 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      radius: 0.8 + Math.random() * 1.4,
      speed: 0.000018 + Math.random() * 0.00003,
      phase: i * 0.35
    }))

    this._resize = () => this.resize()
    window.addEventListener('resize', this._resize, { passive: true })
    this.draw(window.performance.now())
  },

  resize() {
    if (!this.canvas || !this.context) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(window.innerWidth * ratio)
    this.canvas.height = Math.round(window.innerHeight * ratio)
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
  },

  draw(time) {
    if (!this.canvas || !this.context || !document.body.classList.contains('auth-screen')) return
    const ctx = this.context
    const w = window.innerWidth
    const h = window.innerHeight

    ctx.clearRect(0, 0, w, h)

    // Deep Atmospheric Studio Light Gradients
    const glow1 = ctx.createRadialGradient(w * 0.25, h * 0.25, 0, w * 0.25, h * 0.25, w * 0.55)
    glow1.addColorStop(0, 'rgba(245, 158, 11, 0.07)')
    glow1.addColorStop(0.6, 'rgba(217, 119, 6, 0.02)')
    glow1.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = glow1
    ctx.fillRect(0, 0, w, h)

    const glow2 = ctx.createRadialGradient(w * 0.8, h * 0.75, 0, w * 0.8, h * 0.75, w * 0.5)
    glow2.addColorStop(0, 'rgba(99, 102, 241, 0.06)')
    glow2.addColorStop(0.6, 'rgba(79, 70, 229, 0.015)')
    glow2.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = glow2
    ctx.fillRect(0, 0, w, h)

    // Draw Floating Camera Bokeh Circles
    for (const b of this.bokeh) {
      const curX = ((b.x + time * b.speedX) % 1 + 1) % 1 * w
      const curY = ((b.y + time * b.speedY) % 1 + 1) % 1 * h
      const breathe = b.baseAlpha + Math.sin(time * 0.0006 + b.phase) * (b.baseAlpha * 0.4)
      const grad = ctx.createRadialGradient(curX, curY, 0, curX, curY, b.radius)
      grad.addColorStop(0, `rgba(${b.color}, ${breathe})`)
      grad.addColorStop(0.65, `rgba(${b.color}, ${breathe * 0.3})`)
      grad.addColorStop(1, `rgba(${b.color}, 0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(curX, curY, b.radius, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw Dust Particles
    for (const d of this.dust) {
      const y = ((d.y + time * d.speed) % 1) * h
      const pulse = 0.35 + Math.sin(time * 0.0008 + d.phase) * 0.25
      ctx.beginPath()
      ctx.arc(d.x * w, y, d.radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(253, 230, 138, ${pulse})`
      ctx.fill()
    }

    this.frame = requestAnimationFrame(next => this.draw(next))
  },

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame)
    if (this._resize) window.removeEventListener('resize', this._resize)
    this.frame = 0
    this.canvas = null
    this.context = null
    this.bokeh = []
    this.dust = []
  }
}

window.AuthAmbient = AuthAmbient
