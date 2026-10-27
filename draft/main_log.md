# Nhật ký Phát triển: Hệ thống Web App Học Lập trình Robot Giả lập 2D

## 1. Ý tưởng & Cấu trúc Cốt lõi
Xây dựng một ứng dụng web giúp trẻ em học lập trình thông qua robot giả lập (Robot Simulator) trực quan 2D. Hệ thống kết nối giữa **Khung nhập code (Code Editor)** và **Khung môi trường 2D (Simulator Environment)** để tạo ra các phản hồi thời gian thực, tăng tính tương tác và áp dụng cơ chế Gamification (học qua trò chơi).

### Lựa chọn công nghệ & Lộ trình:
- **Trẻ nhỏ (6 - 10 tuổi):** Tích hợp kéo thả khối lệnh (**Google Blockly / Scratch Blocks**) tự động xuất ra JavaScript/Python.
- **Trẻ lớn hơn (12 tuổi trở lên):** Viết code văn bản (**Python** với Pyodide/Brython chạy trực tiếp trên trình duyệt, hoặc **JavaScript**).
- **Engine Đồ họa & Vật lý:** Sử dụng **Matter.js** (xử lý va chạm, ma sát) kết hợp **PixiJS** (vẽ đồ họa 2D mượt mà).

---

## 2. Mô hình Toán học & Logic Robot (Differential Drive)

Dưới đây là cấu trúc dữ liệu mô phỏng một chiếc xe **Arduino Car 2 bánh chủ động** độc lập (Differential Drive) bằng JavaScript.

```javascript
class ArduinoCar2D {
    constructor(x, y, angle = 0) {
        // --- 1. Trạng thái vật lý ---
        this.x = x;                         // Tọa độ X trên màn hình (pixels)
        this.y = y;                         // Tọa độ Y trên màn hình (pixels)
        this.angle = angle;                 // Góc quay của robot (Radian, 0 là hướng sang phải)
        this.radius = 25;                   // Kích thước thân xe (bán kính vòng tròn bao phủ)
        this.wheelBase = 40;                // Khoảng cách giữa 2 bánh xe (độ rộng trục xe)

        // --- 2. Bộ điều khiển Động cơ (Lệnh từ Code của trẻ) ---
        this.leftWheelSpeed = 0;            // Vận tốc bánh trái (-100 đến 100)
        this.rightWheelSpeed = 0;           // Vận tốc bánh phải (-100 đến 100)
        this.maxSpeed = 4;                  // Giới hạn tốc độ di chuyển tối đa trong giả lập

        // --- 3. Dữ liệu Cảm biến (Đọc đầu vào môi trường) ---
        this.sensors = {
            ultrasonicDistance: 999,        // Khoảng cách tới vật cản trước mặt (cm/pixels)
            lineSensors: [0, 1, 0]          // Trạng thái 3 mắt đọc dưới gầm xe: [Trái, Giữa, Phải] (0: Trắng, 1: Đen)
        };
    }

    /**
     * Hàm nhận lệnh điều khiển động cơ từ code của trẻ (tương tự hàm trong Arduino)
     */
    setMotors(leftSpeed, rightSpeed) {
        // Giới hạn giá trị truyền vào từ -100% đến 100%
        const clamp = (val) => Math.max(-100, Math.min(100, val));
        
        // Quy đổi phần trăm tốc độ ra vận tốc thực tế trong game
        this.leftWheelSpeed = (clamp(leftSpeed) / 100) * this.maxSpeed;
        this.rightWheelSpeed = (clamp(rightSpeed) / 100) * this.maxSpeed;
    }

    /**
     * Hàm cập nhật vị trí vật lý (Được gọi liên tục trong vòng lặp Game Loop)
     * Áp dụng thuật toán Differential Drive Kinematics
     */
    update(deltaTime) {
        // Tốc độ trung bình tiến lên của robot
        const linearVelocity = (this.leftWheelSpeed + this.rightWheelSpeed) / 2;
        
        // Tốc độ góc (vận tốc xoay hướng của robot)
        const angularVelocity = (this.rightWheelSpeed - this.leftWheelSpeed) / this.wheelBase;

        // 1. Cập nhật góc quay mới
        this.angle += angularVelocity * deltaTime;

        // 2. Cập nhật tọa độ X, Y mới dựa trên hướng (angle) hiện tại
        this.x += linearVelocity * Math.cos(this.angle) * deltaTime;
        this.y += linearVelocity * Math.sin(this.angle) * deltaTime;
    }

    /**
     * Hàm cập nhật dữ liệu cảm biến (Nhận thông tin từ môi trường map)
     */
    updateSensors(environmentData) {
        // Giả lập bắn tia (Raycasting) để tính toán khoảng cách vật cản
        this.sensors.ultrasonicDistance = this.calculateRaycast(environmentData);
        
        // Giả lập đọc màu sàn tại vị trí 3 mắt đọc dưới gầm
        this.sensors.lineSensors = this.readFloorPixels(environmentData);
    }
}
```

---

## 3. Thuật toán Cảm biến Siêu âm (Ultrasonic Raycasting)

Sử dụng thuật toán **Ray-Line Intersection (Giao điểm giữa Tia và Đoạn thẳng)** để tính toán khoảng cách từ robot tới các chướng ngại vật được cấu tạo bởi các đoạn thẳng kết nối từ điểm $A(x_1, y_1)$ đến $B(x_2, y_2)$.

```javascript
/**
 * Hàm tính khoảng cách từ robot đến vật cản gần nhất (Giả lập cảm biến siêu âm)
 * @param {Object} robot - Đối tượng robot (x, y, angle)
 * @param {Array} walls - Danh sách các bức tường, mỗi tường dạng {x1, y1, x2, y2}
 * @param {number} maxRange - Tầm xa tối đa của cảm biến siêu âm (ví dụ: 300 pixels)
 * @returns {number} Khoảng cách ngắn nhất tìm được (nếu không thấy trả về maxRange)
 */
function getUltrasonicDistance(robot, walls, maxRange = 300) {
    let minDistance = maxRange;

    // 1. Xác định điểm xuất phát của tia (tâm robot) và hướng bắn tia
    const x_p = robot.x;
    const y_p = robot.y;

    // Điểm ảo Q nằm ở cuối tầm xa của cảm biến theo hướng góc của robot
    const x_q = x_p + Math.cos(robot.angle) * maxRange;
    const y_q = y_p + Math.sin(robot.angle) * maxRange;

    // 2. Duyệt qua từng đoạn thẳng (bức tường) trong môi trường để tìm giao điểm
    for (let wall of walls) {
        const x1 = wall.x1;
        const y1 = wall.y1;
        const x2 = wall.x2;
        const y2 = wall.y2;

        // Tính mẫu số (Denominator)
        const den = (x1 - x2) * (y_p - y_q) - (y1 - y2) * (x_p - x_q);

        // Nếu mẫu số bằng 0, tia và tường song song với nhau -> Không cắt
        if (den === 0) continue;

        // Tính các hệ số t và u theo công thức định thức
        const t = ((x1 - x_p) * (y_p - y_q) - (y1 - y_p) * (x_p - x_q)) / den;
        const u = -((x1 - x2) * (y1 - y_p) - (y1 - y2) * (x1 - x_p)) / den;

        // Kiểm tra xem giao điểm có nằm trong đoạn thẳng của bức tường và trên tia bắn ra không
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            // Tính tọa độ điểm va chạm thực tế
            const intersectX = x1 + t * (x2 - x1);
            const intersectY = y1 + t * (y2 - y1);

            // Tính khoảng cách từ tâm robot đến điểm va chạm (Công thức Pitago)
            const dist = Math.sqrt(Math.pow(intersectX - x_p, 2) + Math.pow(intersectY - y_p, 2));

            // Cập nhật khoảng cách nhỏ nhất (vật cản gần nhất)
            if (dist < minDistance) {
                minDistance = dist;
            }
        }
    }

    // Trừ đi bán kính của robot nếu muốn tính khoảng cách từ "đầu xe"
    const finalDistance = minDistance - (robot.radius || 0);
    return Math.max(0, finalDistance);
}
```

---

## 4. Thuật toán Cảm biến Dò đường (Line Follower Sensor)

Xác định vị trí các mắt đọc bằng lượng giác dựa trên tọa độ góc quay thân xe, sau đó lấy mẫu màu điểm ảnh (Pixel Color Sampling) thông qua HTML5 `CanvasRenderingContext2D`.

```javascript
class LineSensorSystem {
    constructor(offsetFromCenter = 15, forwardDistance = 30) {
        this.forwardDistance = forwardDistance; // Khoảng cách từ tâm robot ra phía trước (d)
        this.offset = offsetFromCenter;         // Khoảng cách từ mắt giữa sang mắt trái/phải (w)
        
        // Trạng thái của 3 mắt đọc (0: Nền trắng, 1: Vạch đen)
        this.states = { left: 0, center: 0, right: 0 };
        
        // Lưu tọa độ thực tế của các mắt để vẽ lên UI (tùy chọn)
        this.positions = {
            left: { x: 0, y: 0 },
            center: { x: 0, y: 0 },
            right: { x: 0, y: 0 }
        };
    }

    /**
     * Cập nhật trạng thái đọc vạch của cảm biến
     * @param {Object} robot - Đối tượng robot chứa (x, y, angle)
     * @param {CanvasRenderingContext2D} ctx - Context của Canvas chứa bản đồ vạch đường
     */
    update(robot, ctx) {
        const cos = Math.cos(robot.angle);
        const sin = Math.sin(robot.angle);

        // 1. Tính toán tọa độ (x, y) của 3 mắt đọc trên màn hình
        // Mắt Giữa (Center)
        this.positions.center.x = robot.x + this.forwardDistance * cos;
        this.positions.center.y = robot.y + this.forwardDistance * sin;

        // Mắt Trái (Left) - Lệch một khoảng (-offset) theo trục vuông góc với hướng xe
        this.positions.left.x = robot.x + this.forwardDistance * cos - this.offset * sin;
        this.positions.left.y = robot.y + this.forwardDistance * sin + this.offset * cos;

        // Mắt Phải (Right) - Lệch một khoảng (+offset)
        this.positions.right.x = robot.x + this.forwardDistance * cos + this.offset * sin;
        this.positions.right.y = robot.y + this.forwardDistance * sin - this.offset * cos;

        // 2. Quét màu pixel tại các tọa độ đó và chuyển sang hệ Nhị phân (0 hoặc 1)
        this.states.left = this.isPixelBlack(ctx, this.positions.left.x, this.positions.left.y);
        this.states.center = this.isPixelBlack(ctx, this.positions.center.x, this.positions.center.y);
        this.states.right = this.isPixelBlack(ctx, this.positions.right.x, this.positions.right.y);

        return this.states;
    }

    /**
     * Hàm kiểm tra xem pixel tại tọa độ (x, y) có phải là màu đen (vạch đường) hay không
     */
    isPixelBlack(ctx, x, y) {
        // Đảm bảo tọa độ nằm trong phạm vi canvas để tránh crash
        if (x < 0 || x >= ctx.canvas.width || y < 0 || y >= ctx.canvas.height) return 0;

        // Lấy dữ liệu RGBA của 1 pixel tại tọa độ (x, y) -> Trả về mảng [R, G, B, A]
        const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        const r = pixel[0];
        const g = pixel[1];
        const b = pixel[2];

        // Ngưỡng (Threshold) để xác định màu tối/đen (r+g+b)/3 < 100
        const brightness = (r + g + b) / 3;
        return brightness < 100 ? 1 : 0;
    }
}
```

### 💡 Mẹo tối ưu hóa hiệu năng (Performance):
Để duy trì tốc độ mượt mà 60 FPS, thay vì liên tục gọi hàm tiêu tốn tài nguyên `ctx.getImageData`:
1. Tạo một **Canvas phụ (Offscreen Canvas)** kích thước nhỏ chỉ vẽ đường line màu đen để quét.
2. Hoặc định nghĩa đường đi là các **đoạn thẳng toán học (Vector Lines)** và tính khoảng cách hình học từ điểm mắt đọc đến đoạn thẳng đó.

---

## 5. Thiết kế Bài học mẫu (Gamification)

### 🎯 Nhiệm vụ: "Robot Lau Nhà Thông Minh - Vượt Qua Chướng Ngại Vật"
- **Độ tuổi:** 9 - 13 tuổi.
- **Yêu cầu:** Lập trình điều khiển xe tránh hộp đồ chơi khi cảm biến siêu âm phát hiện khoảng cách < 20cm.
- **Điều kiện thắng:** Lau sạch **80% diện tích phòng** trong 60 giây và va chạm vật cản không quá 3 lần.

#### Mã Python kỳ vọng từ khối lệnh Blockly của trẻ:
```python
while True:
    khoang_cach = robot.get_distance()
    if khoang_cach < 20:
        # Gặp vật cản: Dừng lại và xoay tại chỗ sang hướng khác
        robot.set_motors(0, 0)
        robot.delay(200)
        robot.set_motors(-50, 50)
        robot.delay(500)
    else:
        # Đường thoáng: Tiếp tục tiến thẳng
        robot.set_motors(80, 80)
```

---
*Mở rộng:* Tích hợp hệ thống khối lệnh dịch thẳng ra mã nguồn **C++ (Arduino)** để nạp trực tiếp qua cổng USB nhờ **Web Serial API** giúp robot thật ngoài đời chạy tương tự môi trường giả lập.