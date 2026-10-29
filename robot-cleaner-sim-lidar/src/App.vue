<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Application, Container, Graphics, Text } from 'pixi.js'
import Matter from 'matter-js'
import { drawLidar } from './lidar'

const { Engine, Bodies, Body, Composite, Vector } = Matter
const viewport = ref(null)
const running = ref(true)
const speed = ref(1)
const showTrail = ref(true)
const autoMode = ref(true)
const coverage = ref(0)
const cleaned = ref(0)
const battery = ref(10)
const elapsed = ref(0)
const lidarOn = ref(true)
const lidarRange = ref(180)
const collisionCount = ref(0)
const collisionNow = ref(false)
const nearestDistance = ref(0)
const status = computed(() => running.value ? 'ĐANG MÔ PHỎNG' : 'ĐÃ TẠM DỪNG')

let app, engine, worldLayer, trailLayer, obstacleLayer, dirtLayer, robotLayer, hudLayer, lidarLayer
let robotBody, robotGraphic, trailGraphic, lastTrail = null
let rafTicker, lastTime = 0, simTime = 0, resizeObserver
let arena = { w: 900, h: 560 }
let walls = [], dirtSpots = [], cleanedIds = new Set(), path = []
let direction = 1, turnTimer = 0, lastUiUpdate = 0, collisionClearTimer = 0
let lidarGraphic
const ROBOT_R = 19
const WALL = 22

function makeRect(x, y, w, h, fill, stroke = 0x29404b, radius = 8) {
  const g = new Graphics()
  g.roundRect(x, y, w, h, radius).fill(fill).stroke({ color: stroke, width: 2 })
  return g
}

function addText(parent, text, x, y, style = {}) {
  const t = new Text({ text, style: { fontFamily: 'Inter, Arial, sans-serif', fontSize: 12, fill: 0xd9e7eb, ...style } })
  t.position.set(x, y)
  parent.addChild(t)
  return t
}

function buildArena() {
  Composite.clear(engine.world, false)
  walls = []
  const w = arena.w, h = arena.h
  const opts = { isStatic: true, friction: 0.8, restitution: 0.15, label: 'wall' }
  walls.push(Bodies.rectangle(w / 2, WALL / 2, w, WALL, opts))
  walls.push(Bodies.rectangle(w / 2, h - WALL / 2, w, WALL, opts))
  walls.push(Bodies.rectangle(WALL / 2, h / 2, WALL, h, opts))
  walls.push(Bodies.rectangle(w - WALL / 2, h / 2, WALL, h, opts))
  // Nội thất: đảo bếp, ghế sofa và một chậu cây.
  walls.push(Bodies.rectangle(w * 0.49, h * 0.34, 168, 68, { ...opts, chamfer: { radius: 8 } }))
  walls.push(Bodies.rectangle(w * 0.73, h * 0.70, 112, 74, { ...opts, chamfer: { radius: 8 } }))
  walls.push(Bodies.circle(w * 0.20, h * 0.70, 29, opts))
  Composite.add(engine.world, walls)
  drawObstacles()
}

function drawObstacles() {
  obstacleLayer.removeChildren()
  // Tường ngoài
  obstacleLayer.addChild(makeRect(0, 0, arena.w, WALL, 0x293d48, 0x405965, 5))
  obstacleLayer.addChild(makeRect(0, arena.h - WALL, arena.w, WALL, 0x293d48, 0x405965, 5))
  obstacleLayer.addChild(makeRect(0, 0, WALL, arena.h, 0x293d48, 0x405965, 5))
  obstacleLayer.addChild(makeRect(arena.w - WALL, 0, WALL, arena.h, 0x293d48, 0x405965, 5))
  obstacleLayer.addChild(makeRect(arena.w * 0.49 - 84, arena.h * 0.34 - 34, 168, 68, 0x3b4e59, 0x526a75, 10))
  addText(obstacleLayer, 'ĐẢO BẾP', arena.w * 0.49 - 28, arena.h * 0.34 - 7, { fontSize: 10, fill: 0x9fb5bd, fontWeight: '600' })
  obstacleLayer.addChild(makeRect(arena.w * 0.73 - 56, arena.h * 0.70 - 37, 112, 74, 0x3b4e59, 0x526a75, 12))
  addText(obstacleLayer, 'SOFA', arena.w * 0.73 - 15, arena.h * 0.70 - 7, { fontSize: 10, fill: 0x9fb5bd, fontWeight: '600' })
  const plant = new Graphics().circle(arena.w * 0.20, arena.h * 0.70, 25).fill(0x315b4c).stroke({ color: 0x5e9a7a, width: 2 })
  obstacleLayer.addChild(plant)
  const leaf = new Graphics().star(arena.w * 0.20, arena.h * 0.70, 6, 13, 6).fill(0x70b58e)
  obstacleLayer.addChild(leaf)
}

function spawnDirt() {
  dirtLayer.removeChildren()
  dirtSpots = []
  cleanedIds.clear()
  const candidates = [
    [0.13, 0.22], [0.27, 0.20], [0.35, 0.52], [0.40, 0.75],
    [0.60, 0.18], [0.64, 0.48], [0.84, 0.30], [0.86, 0.84],
    [0.30, 0.85], [0.12, 0.48], [0.57, 0.82], [0.90, 0.53],
    [0.40, 0.18], [0.16, 0.84], [0.62, 0.60], [0.83, 0.18]
  ]
  candidates.forEach(([nx, ny], id) => {
    const x = nx * arena.w, y = ny * arena.h
    if (isBlocked(x, y, 24)) return
    const g = new Graphics().circle(x, y, 5 + (id % 3)).fill({ color: 0xe9b65d, alpha: 0.82 })
    g.circle(x - 2, y - 2, 1.5).fill({ color: 0xffe2a1, alpha: 0.9 })
    dirtLayer.addChild(g)
    dirtSpots.push({ x, y, graphic: g, id })
  })
  cleaned.value = 0
  updateCoverage()
}

function isBlocked(x, y, margin = 0) {
  const rects = [
    [arena.w * .49 - 84, arena.h * .34 - 34, 168, 68],
    [arena.w * .73 - 56, arena.h * .70 - 37, 112, 74]
  ]
  if (Math.hypot(x - arena.w * .20, y - arena.h * .70) < 29 + margin) return true
  return rects.some(([rx, ry, rw, rh]) => x > rx - margin && x < rx + rw + margin && y > ry - margin && y < ry + rh + margin)
}

function makeRobot() {
  robotLayer.removeChildren()
  const glow = new Graphics().circle(0, 0, 30).fill({ color: 0x4de0bf, alpha: 0.10 })
  robotLayer.addChild(glow)
  const body = new Graphics()
  body.circle(0, 0, ROBOT_R).fill(0x4de0bf).stroke({ color: 0xc2fff1, width: 2 })
  body.arc(0, 0, ROBOT_R - 5, -Math.PI * .78, Math.PI * .78).stroke({ color: 0x153d42, width: 4 })
  body.circle(5, -5, 3).fill(0x153d42)
  body.circle(-5, -5, 3).fill(0x153d42)
  body.roundRect(-7, 4, 14, 3, 2).fill(0x153d42)
  robotLayer.addChild(body)
  robotGraphic = body
  robotBody = Bodies.circle(arena.w * .12, arena.h * .16, ROBOT_R, {
    restitution: 0.12, friction: 0.1, frictionAir: 0.05, density: 0.002, label: 'robot'
  })
  Body.setInertia(robotBody, Infinity)
  Composite.add(engine.world, robotBody)
}


function updateCoverage() {
  coverage.value = dirtSpots.length ? Math.round(cleanedIds.size / dirtSpots.length * 100) : 100
}

function cleanNearby(x, y) {
  dirtSpots.forEach(d => {
    if (!cleanedIds.has(d.id) && Math.hypot(d.x - x, d.y - y) < 33) {
      cleanedIds.add(d.id)
      d.graphic.alpha = 0.12
      cleaned.value = cleanedIds.size
      updateCoverage()
    }
  })
}

function nearestObstacleNormal(x, y, dx, dy) {
  const margin = 37
  const probes = [
    [x + dx * margin, y], [x - dx * margin, y],
    [x, y + dy * margin], [x, y - dy * margin]
  ]
  return probes.some(([px, py]) => isBlocked(px, py, 0)) ||
    x < 45 || x > arena.w - 45 || y < 45 || y > arena.h - 45
}

function tick(ticker) {
  if (!app || !engine) return
  const dt = Math.min(ticker.deltaMS || 16.67, 33)
  const setNd = (v) => nearestDistance.value = v
  if (running.value) {
    const step = dt / 16.667 * speed.value
    Engine.update(engine, 16.667 * step)
    simTime += dt * speed.value
    elapsed.value = Math.floor(simTime / 1000)
    let batV = battery.value - dt * speed.value / 13500
    battery.value = Math.max(0, batV)
    const p = robotBody.position
    let vx = Math.cos(direction) * 1.65
    let vy = Math.sin(direction) * 1.65
    turnTimer -= dt
    if (autoMode.value && (turnTimer <= 0 || nearestObstacleNormal(p.x, p.y, vx, vy))) {
      direction += (Math.random() > 0.5 ? 1 : -1) * (0.75 + Math.random() * 1.2)
      turnTimer = 450 + Math.random() * 650
    }
    Body.setVelocity(robotBody, { x: vx * speed.value, y: vy * speed.value })
    Body.setAngularVelocity(robotBody, 0)
    robotGraphic.rotation = direction
    robotLayer.position.set(p.x, p.y)
    drawLidar([lidarGraphic, lidarOn.value, lidarRange.value],
      [p.x, p.y, direction, arena], setNd)
    cleanNearby(p.x, p.y)
    if (showTrail.value) {
      if (!lastTrail || Math.hypot(p.x - lastTrail.x, p.y - lastTrail.y) > 5) {
        const dot = new Graphics().circle(p.x, p.y, 2.2).fill({ color: 0x4de0bf, alpha: 0.34 })
        trailLayer.addChild(dot)
        if (trailLayer.children.length > 1300) trailLayer.removeChildAt(0).destroy()
        lastTrail = { x: p.x, y: p.y }
      }
    }
  } else {
    robotLayer.position.set(robotBody.position.x, robotBody.position.y)
    drawLidar([lidarGraphic, lidarOn.value, lidarRange.value],
      [robotBody.position.x, robotBody.position.y, direction, arena], setNd)
  }
  collisionClearTimer -= dt
  if (collisionClearTimer <= 0) collisionNow.value = false
  if (dt - lastUiUpdate > 250) lastUiUpdate = dt
  if (battery.value <= 0) { speed.value = 0 }
}

async function init() {
  app = new Application()
  await app.init({
    resizeTo: viewport.value,
    antialias: true,
    background: '#17252e',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true
  })
  viewport.value.appendChild(app.canvas)
  engine = Engine.create({ enableSleeping: true })
  engine.gravity.x = 0
  engine.gravity.y = 0
  Matter.Events.on(engine, 'collisionStart', event => {
    const robotHit = event.pairs.some(pair => pair.bodyA.label === 'robot' || pair.bodyB.label === 'robot')
    if (robotHit) { collisionCount.value += 1; collisionNow.value = true; collisionClearTimer = 450 }
  })
  worldLayer = new Container()
  trailLayer = new Container()
  dirtLayer = new Container()
  obstacleLayer = new Container()
  robotLayer = new Container()
  hudLayer = new Container()
  lidarLayer = new Container()
  lidarGraphic = new Graphics()
  lidarLayer.addChild(lidarGraphic)
  app.stage.addChild(worldLayer, trailLayer, lidarLayer, dirtLayer, obstacleLayer, robotLayer, hudLayer)
  // Sàn dạng lưới nhẹ.
  const grid = new Graphics()
  for (let x = 0; x < arena.w; x += 28) grid.moveTo(x, 0).lineTo(x, arena.h)
  for (let y = 0; y < arena.h; y += 28) grid.moveTo(0, y).lineTo(arena.w, y)
  grid.stroke({ color: 0x263943, width: 1, alpha: 0.45 })
  worldLayer.addChild(grid)
  buildArena()
  spawnDirt()
  makeRobot()
  app.ticker.add(tick)
  resizeObserver = new ResizeObserver(() => fitStage())
  resizeObserver.observe(viewport.value)
  fitStage()
}

function fitStage() {
  if (!app || !viewport.value) return
  const scale = Math.min(viewport.value.clientWidth / arena.w, viewport.value.clientHeight / arena.h)
  app.stage.scale.set(scale)
  app.stage.position.set(
    (viewport.value.clientWidth - arena.w * scale) / 2,
    (viewport.value.clientHeight - arena.h * scale) / 2
  )
}

function toggleRun() { running.value = !running.value }
function resetSimulation() {
  running.value = true
  buildArena()
  spawnDirt()

  function resetRobot() {
    if (robotBody) Composite.remove(engine.world, robotBody)
    path = []
    lastTrail = null
    trailLayer.removeChildren()
    makeRobot()
    direction = 1
    turnTimer = 0
    elapsed.value = 0
    battery.value = 100
    collisionCount.value = 0
    collisionNow.value = false
    simTime = 0
  }
  resetRobot()
}
function toggleAuto() { autoMode.value = !autoMode.value }
function toggleTrail() {
  showTrail.value = !showTrail.value
  if (!showTrail.value) trailLayer.removeChildren()
}
function toggleLidar() { lidarOn.value = !lidarOn.value }
function changeSpeed(value) { speed.value = Number(value) }

onMounted(() => init())
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (app) {
    app.ticker.stop()
    app.destroy(true, { children: true, texture: true })
  }
  if (engine) Engine.clear(engine)
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark"><span></span><span></span><span></span></div>
        <div>
          <div class="eyebrow">ROBOTICS PLAYGROUND</div>
          <h1>Cleaner<span>Lab</span></h1>
        </div>
      </div>
      <div class="grp">
        <h2>Robot lau nhà <em>tự hành.</em></h2>
        <p class="subtitle">Quan sát chuyển động, né vật cản và độ phủ làm sạch trong thời gian thực.</p>
      </div>
      <div class="top-status"><i :class="{ live: running }"></i>{{ status }}</div>
      <div class="top-actions">
        <button class="icon-btn" title="Đặt lại mô phỏng" @click="resetSimulation">↻ <span>Đặt lại</span></button>
      </div>
    </header>

    <section class="intro">
      <div>
        <p class="eyebrow mint">MÔ PHỎNG 2D · MATTER.JS + PIXIJS</p>
      </div>
      <div class="engine-pills"><span><b></b> Physics engine</span><span><b></b> GPU-accelerated canvas</span></div>
    </section>

    <section class="dashboard">
      <div class="sim-panel panel">
        <div class="panel-head">
          <div><span class="section-index">01</span><strong>MẶT BẰNG MÔ PHỎNG</strong></div>
          <div class="legend"><span><i class="robot-dot"></i>Robot</span><span><i class="dirt-dot"></i>Bụi
              bẩn</span><span><i class="obstacle-dot"></i>Vật cản</span></div>
        </div>
        <div class="canvas-wrap" ref="viewport">
          <div class="canvas-label"><span>ROOM_01</span><span>900 × 560 UNITS</span></div>
          <div class="canvas-hint"><span class="hint-pulse"></span> LIVE VIEW</div>
        </div>
        <div class="sim-controls">
          <button class="primary-btn" @click="toggleRun"><span>{{ running ? 'Ⅱ' : '▶' }}</span>{{ running ? 'Tạm dừng' :
            'Tiếp tục' }}</button>
          <div class="control-divider"></div>
          <label class="speed-control"><span>TỐC ĐỘ</span><input type="range" min="0.5" max="2.5" step="0.5"
              :value="speed" @input="changeSpeed($event.target.value)"><b>{{ speed.toFixed(1) }}×</b></label>
          <button class="toggle-control" :class="{ selected: autoMode }" @click="toggleAuto"><span
              class="toggle-icon">⌁</span><span>Tự hành</span><i class="toggle-track"><b></b></i></button>
          <button class="toggle-control" :class="{ selected: showTrail }" @click="toggleTrail"><span
              class="toggle-icon">〰</span><span>Vệt di chuyển</span><i class="toggle-track"><b></b></i></button>
          <button class="toggle-control" :class="{ selected: lidarOn }" @click="toggleLidar"><span
              class="toggle-icon">⌁</span><span>LiDAR 2D</span><i class="toggle-track"><b></b></i></button>
        </div>
      </div>

      <aside class="side-column">
        <div class="panel stats-panel">
          <div class="panel-head">
            <div><span class="section-index">02</span><strong>HIỆU SUẤT</strong></div><span class="live-tag">●
              LIVE</span>
          </div>
          <div class="coverage-block">
            <div class="coverage-top"><span>Độ phủ làm sạch</span><strong>{{ coverage }}<small>%</small></strong></div>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: coverage + '%' }"></div>
            </div>
            <div class="progress-caption"><span>{{ cleaned }} / {{ dirtSpots.length }} điểm bụi đã xử lý</span><span>{{
              coverage === 100 ? 'Hoàn tất' : 'Đang làm sạch' }}</span></div>
          </div>
          <div class="stat-grid">
            <div class="stat-card"><span class="stat-icon mint-icon">⌖</span><span class="stat-label">THỜI GIAN
                CHẠY</span><strong>{{ String(Math.floor(elapsed / 60)).padStart(2, '0') }}:{{ String(elapsed %
                  60).padStart(2, '0') }}</strong><small>mm:ss</small></div>
            <div class="stat-card"><span class="stat-icon amber-icon">✳</span><span class="stat-label">PIN ƯỚC
                TÍNH</span><strong>{{ Math.round(battery) }}<small>%</small></strong>
              <div class="mini-battery"><i :style="{ width: battery + '%' }"></i></div>
            </div>
          </div>
        </div>

        <div class="panel lidar-panel">
          <div class="panel-head">
            <div><span class="section-index">03</span><strong>CẢM BIẾN & VA CHẠM</strong></div><span class="live-tag">{{
              lidarOn ? 'LIDAR ON' : 'LIDAR OFF' }}</span>
          </div>
          <div v-if="lidarOn" class="sensor-body">
            <div class="sensor-metric"><span>Khoảng cách gần nhất</span>
              <strong>{{ nearestDistance }} <small>u</small></strong>
            </div>
            <label class="range-control"><span>TẦM QUÉT</span><input type="range" min="80" max="260" step="20"
                v-model.number="lidarRange"><b>{{ lidarRange }} u</b></label>
            <div class="collision-row" :class="{ warning: collisionNow }"><span class="collision-indicator"></span>
              <div><strong>{{ collisionNow ? 'PHÁT HIỆN VA CHẠM' : 'KHÔNG CÓ VA CHẠM' }}</strong><small>{{ collisionNow
                ? 'Robot vừa tiếp xúc vật cản' : 'Theo dõi va chạm qua Matter.js' }}</small></div><b>{{ collisionCount
                  }}</b>
            </div>
            <div class="lidar-legend"><span><i class="green"></i>Xa</span><span><i class="yellow"></i>Trung
                bình</span><span><i class="red"></i>Gần</span></div>
          </div>
        </div>

        <div class="panel info-panel">
          <div class="panel-head">
            <div><span class="section-index">04</span><strong>THÔNG SỐ ROBOT</strong></div>
          </div>
          <div class="robot-profile">
            <div class="robot-avatar">
              <div class="avatar-ring"></div>
              <div class="avatar-core">✳</div>
            </div>
            <div><strong>CL-02 / NOVA</strong><span>Autonomous cleaner</span>
              <div class="online"><i></i> Hệ thống hoạt động</div>
            </div>
          </div>
          <div class="spec-list">
            <div><span>Đường kính</span><b>38 cm</b></div>
            <div><span>Vận tốc mô phỏng</span><b>{{ (speed * 0.35).toFixed(2) }} m/s</b></div>
            <div><span>Điều hướng</span><b>{{ autoMode ? 'Ngẫu nhiên + né vật cản' : 'Trôi tự do' }}</b></div>
            <div><span>Va chạm</span><b><i class="check-dot"></i> {{ collisionNow ? 'Va chạm!' : 'Matter.js' }}</b>
            </div>
          </div>
        </div>

        <div class="tip-card"><span class="tip-icon">✦</span>
          <div><strong>Góc kỹ thuật</strong>
            <p>Thử tăng tốc độ hoặc tắt <b>Tự hành</b> để quan sát phản ứng vật lý. Các chấm vàng mờ dần khi robot đi
              qua.</p>
          </div>
        </div>
      </aside>
    </section>
    <footer><span>CleanerLab <b>v1.0.0</b></span><span>BUILT WITH <b>VUE 3</b> · <b>MATTER.JS</b> ·
        <b>PIXIJS</b></span><span>2D SIMULATION ENVIRONMENT</span></footer>
  </main>
</template>
<style scoped>
.intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 12px 0 12px;
  gap: 20px
}

.mint {
  color: #57d9bb
}

.grp {
  display: inline-flex;
  flex-direction: column;
}

.grp h2 {
  font-size: clamp(27px, 3vw, 38px);
  letter-spacing: -1.8px;
  margin: 0;
  font-weight: 700
}

.grp h2 em {
  font-style: normal;
  color: #54dfbd
}

.subtitle {
  font-size: 12px;
  color: #8fa4ab;
  margin: 0;
  line-height: 1.7
}
</style>