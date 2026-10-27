<template>
  <div class="simulation-container">
    <div ref="canvasContainer" class="canvas-wrapper"></div>
    
    <div class="controls">
      <h3>Robot Lau Nhà Thông Minh 2D</h3>
      <button @click="toggleSimulation">{{ running ? 'Dừng' : 'Tiếp tục' }}</button>
      <button @click="resetSimulation">Reset</button>
      
      <div class="stats">
        <p><b>Bụi đã dọn:</b> {{ cleanedCount }} / {{ totalDust }}</p>
        <p><b>Hiệu suất:</b> {{ efficiency }}%</p>
        <p><b>Chế độ hiện tại:</b> <br><span class="mode-text">{{ currentModeText }}</span></p>
        <p><b>Số vật cản:</b> {{ obstacleCount }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';

const canvasContainer = ref(null);
const running = ref(true);
const cleanedCount = ref(0);
const totalDust = ref(120);
const obstacleCount = ref(6); // Số lượng đồ đạc/vật cản trong phòng
const currentMode = ref('ZIGZAG_FORWARD');

const efficiency = computed(() => {
  if (totalDust.value === 0) return 0;
  return Math.round((cleanedCount.value / totalDust.value) * 100);
});

const currentModeText = computed(() => {
  switch(currentMode.value) {
    case 'ZIGZAG_FORWARD': return '🚀 Đi thẳng Zig-zag';
    case 'TURN_AROUND': return '🔄 Đang quay đầu';
    case 'WALL_FOLLOW': return '🧱 Men theo vật cản';
    default: return 'Chờ';
  }
});

let pixiApp = null;
let engine = null;
let robotBody = null;
let robotGraphics = null;
let dustParticles = [];
let obstacles = []; // Lưu danh sách vật lý của vật cản

const WIDTH = 800;
const HEIGHT = 600;
const ROBOT_RADIUS = 22;
const SPEED = 3.5;

let targetAngle = 0;
let turnDirection = 1;
let wallFollowTimer = 0;

onMounted(async () => {
  // 1. Khởi tạo PixiJS
  pixiApp = new PIXI.Application();
  await pixiApp.init({ width: WIDTH, height: HEIGHT, backgroundColor: 0x1e1e1e });
  canvasContainer.value.appendChild(pixiApp.canvas);

  // 2. Khởi tạo Matter.js
  engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });

  // 3. Tạo môi trường tường bao
  createWalls();

  // 4. Tạo đồ đạc / vật cản ngẫu nhiên
  createObstacles(obstacleCount.value);

  // 5. Tạo bụi (tránh các vùng có vật cản)
  createDust(totalDust.value);

  // 6. Tạo Robot
  createRobot();

  // 7. Xử lý va chạm (với cả tường và đồ đạc) [1]
  Matter.Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
      if (pair.bodyA === robotBody || pair.bodyB === robotBody) {
        handleCollision();
      }
    });
  });

  // 8. Game Loop
  pixiApp.ticker.add((ticker) => {
    if (!running.value) return;

    Matter.Engine.update(engine, ticker.deltaTime * 16.666);

    // Đồng bộ Robot
    robotGraphics.x = robotBody.position.x;
    robotGraphics.y = robotBody.position.y;
    robotGraphics.rotation = robotBody.angle;

    // Thực thi AI
    executeSmartAI();

    // Hút bụi
    checkDustCleanup();
  });
});

function createWalls() {
  const wallOptions = { isStatic: true, restitution: 0.2 };
  const thickness = 24;

  const topWall = Matter.Bodies.rectangle(WIDTH / 2, thickness / 2, WIDTH, thickness, wallOptions);
  const bottomWall = Matter.Bodies.rectangle(WIDTH / 2, HEIGHT - thickness / 2, WIDTH, thickness, wallOptions);
  const leftWall = Matter.Bodies.rectangle(thickness / 2, HEIGHT / 2, thickness, HEIGHT, wallOptions);
  const rightWall = Matter.Bodies.rectangle(WIDTH - thickness / 2, HEIGHT / 2, thickness, HEIGHT, wallOptions);
  
  Matter.Composite.add(engine.world, [topWall, bottomWall, leftWall, rightWall]);

  const wallGraphics = new PIXI.Graphics()
    .rect(0, 0, WIDTH, thickness)
    .rect(0, HEIGHT - thickness, WIDTH, thickness)
    .rect(0, 0, thickness, HEIGHT)
    .rect(WIDTH - thickness, 0, thickness, HEIGHT)
    .fill(0x3e4444);
  
  pixiApp.stage.addChild(wallGraphics);
}

// Hàm tạo vật cản/đồ đạc ngẫu nhiên vuông hoặc tròn [1]
function createObstacles(count) {
  for (let i = 0; i < count; i++) {
    // Tạo tọa độ ngẫu nhiên ở khu vực trung tâm phòng
    const x = Math.random() * (WIDTH - 300) + 150;
    const y = Math.random() * (HEIGHT - 200) + 100;
    const isBox = Math.random() > 0.4; // 60% hình hộp, 40% hình tròn

    let body;
    const graphic = new PIXI.Graphics();

    if (isBox) {
      const w = Math.random() * 50 + 40; // Rộng từ 40px -> 90px
      const h = Math.random() * 50 + 40; // Cao từ 40px -> 90px
      
      body = Matter.Bodies.rectangle(x, y, w, h, { isStatic: true, restitution: 0.2 });
      
      graphic.rect(-w / 2, -h / 2, w, h)
             .fill(0x7f8c8d)
             .stroke({ width: 2, color: 0xbdc3c7 });
    } else {
      const radius = Math.random() * 25 + 20; // Bán kính từ 20px -> 45px
      
      body = Matter.Bodies.circle(x, y, radius, { isStatic: true, restitution: 0.2 });
      
      graphic.circle(0, 0, radius)
             .fill(0xa4b0be)
             .stroke({ width: 2, color: 0xf1f2f6 });
    }

    // Đặt vị trí đồ họa trùng với vật lý
    graphic.x = x;
    graphic.y = y;

    // Cho phép đồ đạc có góc xoay ngẫu nhiên cho tự nhiên
    const randomAngle = Math.random() * Math.PI;
    Matter.Body.setAngle(body, randomAngle);
    graphic.rotation = randomAngle;

    Matter.Composite.add(engine.world, body);
    pixiApp.stage.addChild(graphic);
    
    obstacles.push(body); // Lưu trữ để xử lý khoảng cách tạo bụi
  }
}

function createDust(count) {
  let created = 0;
  while (created < count) {
    const x = Math.random() * (WIDTH - 80) + 40;
    const y = Math.random() * (HEIGHT - 80) + 40;

    // Kiểm tra xem vị trí sinh bụi có bị đè lên đồ đạc không
    let insideObstacle = false;
    for (let obs of obstacles) {
      // Kiểm tra sơ bộ bằng khoảng cách tâm để tối ưu hiệu năng
      const dist = Math.hypot(obs.position.x - x, obs.position.y - y);
      if (dist < 60) { // Nếu quá gần tâm vật cản thì bỏ qua vùng này
        insideObstacle = true;
        break;
      }
    }

    if (!insideObstacle) {
      const graphic = new PIXI.Graphics().circle(0, 0, 3).fill(0xffd700);
      graphic.x = x;
      graphic.y = y;

      pixiApp.stage.addChild(graphic);
      dustParticles.push({ x, y, graphic, cleaned: false });
      created++;
    }
  }
}

function createRobot() {
  // Đặt robot ở góc trái trên cùng để tránh đè trúng vật cản lúc khởi khởi tạo
  robotBody = Matter.Bodies.circle(70, 70, ROBOT_RADIUS, {
    friction: 0.1,
    frictionAir: 0.04,
    restitution: 0.1
  });
  Matter.Body.setAngle(robotBody, 0.5);
  Matter.Composite.add(engine.world, robotBody);

  robotGraphics = new PIXI.Container();

  const bodyGeom = new PIXI.Graphics()
    .circle(0, 0, ROBOT_RADIUS)
    .fill(0x00d2d3)
    .stroke({ width: 3, color: 0xffffff });

  const frontLight = new PIXI.Graphics()
    .poly([0, -8, ROBOT_RADIUS, 0, 0, 8])
    .fill(0xffff00);

  robotGraphics.addChild(bodyGeom);
  robotGraphics.addChild(frontLight);
  pixiApp.stage.addChild(robotGraphics);
}

function executeSmartAI() {
  const currentAngle = robotBody.angle;

  switch (currentMode.value) {
    case 'ZIGZAG_FORWARD':
      Matter.Body.setVelocity(robotBody, {
        x: Math.cos(currentAngle) * SPEED,
        y: Math.sin(currentAngle) * SPEED
      });
      break;

    case 'TURN_AROUND':
      let angleDiff = targetAngle - currentAngle;
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

      if (Math.abs(angleDiff) > 0.05) {
        Matter.Body.setAngularVelocity(robotBody, turnDirection * 0.09);
        Matter.Body.setVelocity(robotBody, { x: 0, y: 0 });
      } else {
        Matter.Body.setAngle(robotBody, targetAngle);
        Matter.Body.setAngularVelocity(robotBody, 0);
        currentMode.value = 'ZIGZAG_FORWARD';
      }
      break;

    case 'WALL_FOLLOW':
      Matter.Body.setVelocity(robotBody, {
        x: Math.cos(currentAngle) * (SPEED * 0.85),
        y: Math.sin(currentAngle) * (SPEED * 0.85)
      });
      
      // Bo cua nhẹ vòng quanh vật cản
      Matter.Body.setAngularVelocity(robotBody, 0.025 * turnDirection);

      wallFollowTimer--;
      if (wallFollowTimer <= 0) {
        // Hết thời gian bám vật cản -> Bật ra đi tiếp hướng mới
        targetAngle = currentAngle + Math.PI * 0.7; 
        currentMode.value = 'TURN_AROUND';
      }
      break;
  }
}

// Kích hoạt khi robot đâm trúng tường bao hoặc đồ đạc [1]
function handleCollision() {
  const currentAngle = robotBody.angle;
  const rand = Math.random();

  if (currentMode.value === 'ZIGZAG_FORWARD') {
    turnDirection = Math.random() > 0.5 ? 1 : -1;
    
    if (rand < 0.6) {
      // Chế độ 1: Quay đầu đi làn song song tránh vật cản
      targetAngle = currentAngle + Math.PI + (turnDirection * 0.4);
      currentMode.value = 'TURN_AROUND';
    } else {
      // Chế độ 2: Men vòng quanh vật cản vừa chạm trúng để quét sạch bụi xung quanh mép đồ đạc
      currentMode.value = 'WALL_FOLLOW';
      wallFollowTimer = 150; // Chạy ôm cua quanh đồ vật trong 150 frames (~2.5 giây)
    }
  }
}

function checkDustCleanup() {
  const rx = robotBody.position.x;
  const ry = robotBody.position.y;

  dustParticles.forEach(dust => {
    if (dust.cleaned) return;
    const dist = Math.hypot(dust.x - rx, dust.y - ry);
    if (dist < ROBOT_RADIUS) {
      dust.cleaned = true;
      pixiApp.stage.removeChild(dust.graphic);
      cleanedCount.value++;
    }
  });
}

function toggleSimulation() {
  running.value = !running.value;
}

function resetSimulation() {
  location.reload();
}

onBeforeUnmount(() => {
  if (pixiApp) pixiApp.destroy(true, { children: true, texture: true });
  if (engine) Matter.Engine.clear(engine);
});
</script>

<style scoped>
.simulation-container {
  display: flex;
  flex-direction: row;
  gap: 20px;
  background-color: #2c3e50;
  padding: 25px;
  border-radius: 16px;
  color: white;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  box-shadow: 0 10px 25px rgba(0,0,0,0.3);
}
.canvas-wrapper {
border: 4px solid #34495e;
border-radius: 12px;
overflow: hidden;
}
.controls {
display: flex;
flex-direction: column;
gap: 15px;
min-width: 220px;
}
h3 {
margin-top: 0;
color: #1dd1a1;
text-align: center;
}
button {
padding: 12px;
background-color: #10ac84;
color: white;
border: none;
border-radius: 8px;
cursor: pointer;
font-weight: bold;
transition: all 0.2s ease;
}
button:hover {
background-color: #1dd1a1;
transform: translateY(-2px);
}
.stats {
background-color: #34495e;
padding: 15px;
border-radius: 8px;
font-size: 14px;
line-height: 1.6;
}
.mode-text {
display: inline-block;
margin-top: 5px;
padding: 4px 8px;
background-color: #222f3e;
border-radius: 4px;
color: #ff9f43;
font-weight: bold;
}
</style>