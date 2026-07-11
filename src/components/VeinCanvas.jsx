import { useEffect, useRef } from 'react'

export default function VeinCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    let animId, W, H, nodes = [], pulses = []
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Grow a single meandering vein: short segments with a random heading drift each
    // step (a wander, not a symmetric fork), plus the occasional thin offshoot —
    // closer to how real veins branch irregularly than a clean recursive tree.
    function growVein(x, y, angle, remaining, thickness, depth = 5) {
      let cx = x, cy = y, cAngle = angle, rem = remaining, thick = thickness
      while (rem > 14 && thick > 0.28) {
        const segLen = 10 + Math.random() * 16
        cAngle += (Math.random() - 0.5) * 0.55
        const nx = cx + Math.cos(cAngle) * segLen
        const ny = cy + Math.sin(cAngle) * segLen
        nodes.push({ x: cx, y: cy, endX: nx, endY: ny, thickness: thick })
        if (depth > 0 && thick > 0.55 && Math.random() < 0.045) {
          const dir = Math.random() < 0.5 ? -1 : 1
          const branchAngle = cAngle + dir * (0.5 + Math.random() * 0.7)
          growVein(nx, ny, branchAngle, segLen * (2.5 + Math.random() * 2.5), thick * 0.5, depth - 1)
        }
        cx = nx; cy = ny
        rem -= segLen
        thick *= 0.965 + Math.random() * 0.02
      }
    }

    function resize() {
      W = canvas.width  = canvas.parentElement.offsetWidth
      H = canvas.height = canvas.parentElement.offsetHeight
      nodes = []; pulses = []

      const origins = [
        { x: W * 0.08, y: H * 0.94, a: -1.15, len: H * 0.62, th: 3.2 },
        { x: W * 0.30, y: H * 1.05, a: -1.55, len: H * 0.55, th: 2.8 },
        { x: W * 0.58, y: H * 1.06, a: -1.35, len: H * 0.5,  th: 3.0 },
        { x: W * 0.95, y: H * 0.55, a: 2.85,  len: W * 0.32, th: 2.6 },
        { x: W * 0.85, y: H * 0.12, a: 2.0,   len: H * 0.35, th: 2.2 },
      ]
      origins.forEach(o => growVein(o.x, o.y, o.a, o.len, o.th))
    }

    let t = 0
    function draw() {
      ctx.clearRect(0, 0, W, H)
      if (!reduce) t += 0.006

      // Draw vein segments with animated draw-on
      nodes.forEach((n, i) => {
        const progress = Math.min(1, t * 0.3 - i * 0.008)
        if (progress <= 0) return
        const ex = n.x + (n.endX - n.x) * progress
        const ey = n.y + (n.endY - n.y) * progress
        const alpha = 0.11 + Math.min(n.thickness, 3) * 0.032
        const width = Math.max(0.4, n.thickness * 0.5)
        ctx.beginPath()
        ctx.moveTo(n.x, n.y)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = `rgba(180,24,44,${alpha})`
        ctx.lineWidth   = width
        ctx.lineCap     = 'round'
        ctx.stroke()
      })

      // Pulse dots travelling along veins
      if (!reduce && Math.random() < 0.018 && nodes.length > 10) {
        const n = nodes[Math.floor(Math.random() * nodes.length)]
        pulses.push({ node: n, t: 0, speed: 0.008 + Math.random() * 0.012 })
      }
      pulses = pulses.filter(p => p.t <= 1)
      pulses.forEach(p => {
        p.t += p.speed
        const x = p.node.x + (p.node.endX - p.node.x) * p.t
        const y = p.node.y + (p.node.endY - p.node.y) * p.t
        const alpha = Math.sin(p.t * Math.PI) * 0.8
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,16,46,${alpha})`
        ctx.fill()
        // glow
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,16,46,${alpha * 0.2})`
        ctx.fill()
      })

      animId = requestAnimationFrame(draw)
    }

    window.addEventListener('resize', resize)
    resize()
    draw()
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    />
  )
}
