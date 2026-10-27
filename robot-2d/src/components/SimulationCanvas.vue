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
const totalDust = ref(150); // Tăng lượng bụi để kiểm chứng thuật toán
const currentMode = ref('ZIGZAG_FORWARD'); // Các chế độ: ZIGZAG_FORWARD, TURN_AROUND, WALL_FOLLOW

const efficiency = computed(() => {
  if (totalDust.value === 0) return 0;
  return Math.round((cleanedCount.value / totalDust.value) * 100);
});

const currentModeText = computed(() => {
  switch(currentMode.value) {
    case 'ZIGZAG_FORWARD': return '🚀 Đi thẳng Zig-zag';
    case 'TURN_AROUND': return '🔄 Đang quay đầu';
    case 'WALL_FOLLOW': return '🧱 Men theo tường bao';
    default: return 'Chờ';
  }
});

let pixiApp = null;
let engine = null;
let robotBody = null;
let robotGraphics = null;
let dustParticles = [];

const WIDTH = 800;
const HEIGHT = 600;
const ROBOT_RADIUS = 22;
const SPEED = 3.5;

// Các biến phục vụ thuật toán di chuyển
let targetAngle = 0;
let turnDirection = 1; // 1: cùng chiều kim đồng hồ, -1: ngược chiều
let wallFollowTimer = 0;

onMounted(async () => {
  // 1. Khởi tạo PixiJS
  pixiApp = new PIXI.Application();
  await pixiApp.init({ width: WIDTH, height: HEIGHT, backgroundColor: 0x1e1e1e });
  canvasContainer.value.appendChild(pixiApp.canvas);

  // 2. Khởi tạo Matter.js (Bật chế độ không trọng lực)
  engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });

  // 3. Tạo môi trường
  createWalls();
  createDust(totalDust.value);
  createRobot();

  // 4. Xử lý va chạm thông minh (Sử dụng Event của Matter.js)
  Matter.Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
      // Nếu một trong hai vật thể va chạm là Robot
      if (pair.bodyA === robotBody || pair.bodyB === robotBody) {
        handleWallCollision();
      }
    });
  });

  // 5. Game Loop
  pixiApp.ticker.add((ticker) => {
    if (!running.value) return;

    Matter.Engine.update(engine, ticker.deltaTime * 16.666);

    // Đồng bộ Đồ họa & Vật lý
    robotGraphics.x = robotBody.position.x;
    robotGraphics.y = robotBody.position.y;
    robotGraphics.rotation = robotBody.angle;

    // Thực thi AI điều khiển Robot theo chế độ
    executeSmartAI();

    // Hút bụi
    checkDustCleanup();
  });
});

function createWalls() {
  const wallOptions = { isStatic: true, restitution: 0.2, label: 'wall' };
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

function createDust(count) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * (WIDTH - 100) + 50;
    const y = Math.random() * (HEIGHT - 100) + 50;

    const graphic = new PIXI.Graphics().circle(0, 0, 3).fill(0xffd700);
    graphic.x = x;
    graphic.y = y;

    pixiApp.stage.addChild(graphic);
    dustParticles.push({ x, y, graphic, cleaned: false });
  }
}

function createRobot() {
  // Tạo robot với góc ban đầu nằm ngang (0 rad = hướng sang phải)
  robotBody = Matter.Bodies.circle(100, 100, ROBOT_RADIUS, {
    friction: 0.1,
    frictionAir: 0.05,
    restitution: 0.1
  });
  Matter.Body.setAngle(robotBody, 0);
  Matter.Composite.add(engine.world, robotBody);

  robotGraphics = new PIXI.Container();

  // Thân máy hút bụi
  const bodyGeom = new PIXI.Graphics()
    .circle(0, 0, ROBOT_RADIUS)
    .fill(0x00d2d3)
    .stroke({ width: 3, color: 0xffffff });

  // Đèn tín hiệu phía trước định hướng
  const frontLight = new PIXI.Graphics()
    .poly([0, -8, ROBOT_RADIUS, 0, 0, 8])
    .fill(0xffff00);

  robotGraphics.addChild(bodyGeom);
  robotGraphics.addChild(frontLight);
  pixiApp.stage.addChild(robotGraphics);
}

// THUẬT TOÁN ĐIỀU KHIỂN THÔNG MINH (FSM - Finite State Machine)
function executeSmartAI() {
  const currentAngle = robotBody.angle;

  switch (currentMode.value) {
    case 'ZIGZAG_FORWARD':
      // Chế độ 1: Luôn tiến thẳng theo hướng hiện tại
      Matter.Body.setVelocity(robotBody, {
        x: Math.cos(currentAngle) * SPEED,
        y: Math.sin(currentAngle) * SPEED
      });
      break;

    case 'TURN_AROUND':
      // Chế độ 2: Xoay robot cho tới khi đạt được góc mục tiêu (Quay đầu tịnh tiến)
      let angleDiff = targetAngle - currentAngle;
      
      // Chuẩn hóa góc quay trong khoảng -PI đến PI
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

      if (Math.abs(angleDiff) > 0.05) {
        // Cập nhật vận tốc góc để quay
        Matter.Body.setAngularVelocity(robotBody, turnDirection * 0.08);
        // Giữ robot đứng yên tại chỗ khi xoay để tránh bị trượt vật lý
        Matter.Body.setVelocity(robotBody, { x: 0, y: 0 });
      } else {
        // Đã quay xong góc mục tiêu -> Tiến lên tiếp theo đường Zig-zag mới
        Matter.Body.setAngle(robotBody, targetAngle);
        Matter.Body.setAngularVelocity(robotBody, 0);
        currentMode.value = 'ZIGZAG_FORWARD';
      }
      break;

    case 'WALL_FOLLOW':
      // Chế độ 3: Men sát theo chân tường trong một khoảng thời gian cố định
      Matter.Body.setVelocity(robotBody, {
        x: Math.cos(currentAngle) * (SPEED * 0.9),
        y: Math.sin(currentAngle) * (SPEED * 0.9)
      });
      
      // Tạo một lực bo cua nhẹ để robot ôm sát góc tường bao
      Matter.Body.setAngularVelocity(robotBody, 0.015);

      wallFollowTimer--;
      if (wallFollowTimer <= 0) {
        // Hết thời gian chạy bám tường -> Quay lại quét sàn zigzag góc ngẫu nhiên
        targetAngle = currentAngle + Math.PI * 0.65; 
        currentMode.value = 'TURN_AROUND';
      }
      break;
  }
}

// Xử lý thông minh khi chạm tường bao
function handleWallCollision() {
  const currentAngle = robotBody.angle;
  
  // Xác suất ngẫu nhiên để robot đổi trạng thái tăng độ phủ phòng sạch
  const rand = Math.random();

  if (currentMode.value === 'ZIGZAG_FORWARD') {
    if (rand < 0.65) {
      // 65% Cơ hội: Robot thực hiện quay ngược đầu 180 độ + dịch chuyển một góc song song
      turnDirection = Math.random() > 0.5 ? 1 : -1;
      targetAngle = currentAngle + Math.PI + (turnDirection * 0.3); // 180 độ + lệch dòng quét bụi
      currentMode.value = 'TURN_AROUND';
    } else {
      // 35% Cơ hội: Chuyển sang chế độ Men theo góc tường để dọn bụi các góc khuất kẹt
      currentMode.value = 'WALL_FOLLOW';
      wallFollowTimer = 220; // Chạy bám tường khoảng 220 khung hình (~3.5 giây)
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

<style scoped src="./simcanvas.css"></style>
