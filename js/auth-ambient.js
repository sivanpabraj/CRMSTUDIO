/* Lightweight ambient canvas for the authentication screen. */
const AuthAmbient = {
  frame: 0,
  canvas: null,
  context: null,
  particles: [],

  mount() {
    const canvas = document.querySelector('[data-auth-ambient]')
    if (!canvas || canvas === this.canvas) return
    this.destroy()
    this.canvas = canvas
    this.context = canvas.getContext('2d', { alpha: true })
    if (!this.context || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    this.resize()
    this.particles = Array.from({ length: Math.min(36, Math.max(18, Math.round(window.innerWidth / 45))) }, (_, index) => ({
      x: Math.random(), y: Math.random(), radius: 0.7 + Math.random() * 1.8,
      speed: 0.000025 + Math.random() * 0.000045, phase: index * 0.61
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
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    const glow = ctx.createRadialGradient(window.innerWidth * 0.5, window.innerHeight * 0.3, 0, window.innerWidth * 0.5, window.innerHeight * 0.3, window.innerWidth * 0.65)
    glow.addColorStop(0, 'rgba(29, 103, 235, .12)')
    glow.addColorStop(0.46, 'rgba(26, 58, 126, .05)')
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
    for (const particle of this.particles) {
      const y = (particle.y + time * particle.speed) % 1
      const pulse = 0.42 + Math.sin(time * 0.0007 + particle.phase) * 0.18
      ctx.beginPath()
      ctx.arc(particle.x * window.innerWidth, y * window.innerHeight, particle.radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(92, 160, 255, ${pulse})`
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
    this.particles = []
  }
}

window.AuthAmbient = AuthAmbient
