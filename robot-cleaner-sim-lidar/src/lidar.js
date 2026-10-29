const LIDAR_RAYS = 60
const WALL = 22
// Raycast 2D: giao tia với hình chữ nhật trục-aligned và đường tròn.
function rayRectDistance(ox, oy, dx, dy, rect) {
    const [x, y, w, h] = rect
    let tmin = -Infinity, tmax = Infinity
    for (const [o, d, min, max] of [[ox, dx, x, x + w], [oy, dy, y, y + h]]) {
        if (Math.abs(d) < 1e-8) { if (o < min || o > max) return Infinity; continue }
        let t1 = (min - o) / d, t2 = (max - o) / d
        if (t1 > t2) [t1, t2] = [t2, t1]
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
    }
    if (tmax < Math.max(0, tmin)) return Infinity
    const distance = tmin >= 0 ? tmin : tmax
    return distance >= 0 ? distance : Infinity
}
function rayCircleDistance(ox, oy, dx, dy, cx, cy, radius) {
    const fx = ox - cx, fy = oy - cy
    const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - radius * radius
    const disc = b * b - 4 * c
    if (disc < 0) return Infinity
    const t1 = (-b - Math.sqrt(disc)) / 2, t2 = (-b + Math.sqrt(disc)) / 2
    if (t1 >= 0) return t1
    return t2 >= 0 ? t2 : Infinity
}
function castLidarRay(ox, oy, angle, range, arena) {
    const dx = Math.cos(angle), dy = Math.sin(angle)
    let best = range
    // Phạm vi phòng (tường ngoài)
    const boundary = [
        dx > 0 ? (arena.w - WALL - ox) / dx : dx < 0 ? (WALL - ox) / dx : Infinity,
        dy > 0 ? (arena.h - WALL - oy) / dy : dy < 0 ? (WALL - oy) / dy : Infinity
    ].filter(v => v >= 0)
    if (boundary.length) best = Math.min(best, ...boundary)
    const rects = [
        [arena.w * .49 - 84, arena.h * .34 - 34, 168, 68],
        [arena.w * .73 - 56, arena.h * .70 - 37, 112, 74]
    ]
    for (const rect of rects) best = Math.min(best, rayRectDistance(ox, oy, dx, dy, rect))
    best = Math.min(best, rayCircleDistance(ox, oy, dx, dy, arena.w * .20, arena.h * .70, 29))
    return { x: ox + dx * best, y: oy + dy * best, distance: best }
}
export function drawLidar([lidarGraphic, lidarOn, range], [x, y, heading, arena], fn) {
    if (!lidarGraphic) return
    lidarGraphic.clear()
    if (!lidarOn) { fn(0); return }
    let nearest = range
    for (let i = 0; i < LIDAR_RAYS; i++) {
        const angle = heading + i * Math.PI * 2 / LIDAR_RAYS
        const hit = castLidarRay(x, y, angle, range, arena)
        nearest = Math.min(nearest, hit.distance)
        const close = hit.distance < 42
        const medium = hit.distance < 85
        const color = close ? 0xff6b6b : medium ? 0xe9b65d : 0x4de0bf
        lidarGraphic.moveTo(x, y).lineTo(hit.x, hit.y).stroke({ color, width: close ? 1.5 : 1, alpha: close ? 0.68 : 0.25 })
        lidarGraphic.circle(hit.x, hit.y, close ? 2.2 : 1.3).fill({ color, alpha: close ? 0.95 : 0.6 })
    }
    fn(Math.round(nearest))
}