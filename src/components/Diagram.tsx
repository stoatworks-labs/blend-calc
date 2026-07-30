import type { ScreenGeometry, Solution } from '../types'

/**
 * Front elevation. Drawn in metres in the SVG user space with a viewBox that
 * matches the covered area plus a margin, so nothing needs manual scaling —
 * the browser does the fitting and the stroke widths are the only thing that
 * has to be expressed relative to the scene.
 */
export function FrontElevation({
  sol,
  columns,
  rows,
  screen,
}: {
  sol: Solution
  columns: number
  rows: number
  screen: ScreenGeometry
}) {
  const W = sol.coveredWidth
  const H = sol.coveredHeight
  if (!(W > 0) || !(H > 0)) return null

  const pad = Math.max(W, H) * 0.06
  const stroke = Math.max(W, H) * 0.0022
  const pitchX = sol.tileWidth * (1 - sol.hOverlap)
  const pitchY = sol.tileHeight * (1 - sol.vOverlap)

  // Screen sits centred inside the covered area, so any spill shows as image
  // hanging off the edges.
  const scrX = (W - screen.width) / 2
  const scrY = (H - screen.height) / 2

  const tiles: { x: number; y: number; label: string }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      tiles.push({
        x: c * pitchX,
        y: r * pitchY,
        label: rows > 1 ? `R${r + 1}C${c + 1}` : `P${c + 1}`,
      })
    }
  }

  const fontSize = Math.min(sol.tileWidth * 0.11, sol.tileHeight * 0.16)

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`}
      role="img"
      aria-label="Front elevation of the projector array over the screen"
    >
      {/* screen surface */}
      <rect x={scrX} y={scrY} width={screen.width} height={screen.height} fill="#0f2033" />

      {/* overlap bands */}
      {Array.from({ length: Math.max(0, columns - 1) }, (_, c) => (
        <rect
          key={`h${c}`}
          x={c * pitchX + sol.tileWidth - sol.hOverlapMetres}
          y={0}
          width={sol.hOverlapMetres}
          height={H}
          fill="#f9a03f"
          opacity={0.34}
        />
      ))}
      {Array.from({ length: Math.max(0, rows - 1) }, (_, r) => (
        <rect
          key={`v${r}`}
          x={0}
          y={r * pitchY + sol.tileHeight - sol.vOverlapMetres}
          width={W}
          height={sol.vOverlapMetres}
          fill="#f9a03f"
          opacity={0.34}
        />
      ))}

      {/* tiles */}
      {tiles.map((t, i) => (
        <g key={i}>
          <rect
            x={t.x}
            y={t.y}
            width={sol.tileWidth}
            height={sol.tileHeight}
            fill="none"
            stroke="#4cc9f0"
            strokeWidth={stroke}
          />
          <text
            x={t.x + sol.tileWidth * 0.04}
            y={t.y + fontSize * 1.3}
            fill="#4cc9f0"
            fontSize={fontSize}
            fontFamily="ui-monospace, monospace"
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* screen outline on top so it is never buried */}
      <rect
        x={scrX}
        y={scrY}
        width={screen.width}
        height={screen.height}
        fill="none"
        stroke="#e8eef5"
        strokeWidth={stroke * 1.6}
      />
    </svg>
  )
}

/**
 * Plan view of a cylindrical screen: the arc, each projector position, and the
 * sight lines to the edges of its own tile.
 */
export function PlanView({
  sol,
  radius,
  arcLength,
  throwDistance,
  placement,
}: {
  sol: Solution
  radius: number
  arcLength: number
  throwDistance: number
  placement: 'per-tile' | 'common-point'
}) {
  const theta = arcLength / radius
  if (!(theta > 0) || !Number.isFinite(theta)) return null
  const clamped = Math.min(theta, Math.PI * 2)

  // Screen centre of curvature at the origin; the arc apex is at (0, -radius)
  // so the drawing reads the way you stand in the room: screen at the top.
  const pt = (angle: number, r: number) => ({
    x: r * Math.sin(angle),
    y: -r * Math.cos(angle),
  })

  const arcPts: string[] = []
  const steps = 160
  for (let i = 0; i <= steps; i++) {
    const a = -clamped / 2 + (clamped * i) / steps
    const p = pt(a, radius)
    arcPts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)},${p.y.toFixed(4)}`)
  }

  const nCols = sol.columns.length
  const thetaTile = sol.tileWidth / radius
  const pitch = (sol.tileWidth * (1 - sol.hOverlap)) / radius

  const rigs = Array.from({ length: nCols }, (_, c) => {
    const phi = (c - (nCols - 1) / 2) * pitch
    const origin = placement === 'per-tile' ? pt(phi, radius - throwDistance) : pt(0, radius - throwDistance)
    return {
      origin,
      left: pt(phi - thetaTile / 2, radius),
      right: pt(phi + thetaTile / 2, radius),
    }
  })

  // Bound everything that will be drawn.
  const xs = [...arcPts.map(() => 0), ...rigs.flatMap((r) => [r.origin.x, r.left.x, r.right.x])]
  const halfSpan = Math.max(radius * Math.sin(clamped / 2), ...xs.map(Math.abs))
  const yTop = -radius
  const yBottom = Math.max(
    ...rigs.map((r) => r.origin.y),
    -radius * Math.cos(clamped / 2),
  )
  const w = halfSpan * 2
  const h = yBottom - yTop
  const pad = Math.max(w, h) * 0.08
  const stroke = Math.max(w, h) * 0.004

  return (
    <svg
      viewBox={`${-halfSpan - pad} ${yTop - pad} ${w + pad * 2} ${h + pad * 2}`}
      role="img"
      aria-label="Plan view of the curved screen and projector positions"
    >
      {rigs.map((r, i) => (
        <g key={i}>
          <path
            d={`M${r.origin.x},${r.origin.y} L${r.left.x},${r.left.y} L${r.right.x},${r.right.y} Z`}
            fill="#4cc9f0"
            opacity={0.09}
          />
          <line
            x1={r.origin.x}
            y1={r.origin.y}
            x2={r.left.x}
            y2={r.left.y}
            stroke="#4cc9f0"
            strokeWidth={stroke * 0.55}
            opacity={0.75}
          />
          <line
            x1={r.origin.x}
            y1={r.origin.y}
            x2={r.right.x}
            y2={r.right.y}
            stroke="#4cc9f0"
            strokeWidth={stroke * 0.55}
            opacity={0.75}
          />
        </g>
      ))}

      <path d={arcPts.join(' ')} fill="none" stroke="#e8eef5" strokeWidth={stroke * 1.4} />

      {rigs.map((r, i) => (
        <circle key={i} cx={r.origin.x} cy={r.origin.y} r={stroke * 2.2} fill="#f9a03f" />
      ))}
    </svg>
  )
}
