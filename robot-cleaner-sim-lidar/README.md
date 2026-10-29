# CleanerLab — Robot lau nhà 2D

Starter project dùng **Vue 3 + Vite + Matter.js + PixiJS 8**.

## Chạy local
```bash
npm install
npm run dev
```
Mở URL Vite in ra terminal (thường là `http://localhost:5173`). Yêu cầu Node.js 20+.

## Build production
```bash
npm run build
npm run preview
```

## Tính năng
- Mặt bằng 2D với tường, đảo bếp, sofa và chậu cây.
- Matter.js làm physics world, robot là rigid body và có collision event với vật cản.
- PixiJS vẽ canvas, lưới, bụi bẩn, robot và vệt đường đi.
- **LiDAR 2D 360°**: 60 tia đo khoảng cách, điều chỉnh tầm quét, tô màu xanh/vàng/đỏ theo khoảng cách và hiển thị khoảng cách gần nhất.
- **Phát hiện va chạm** bằng `Matter.Events` (`collisionStart`), đếm số lần robot va chạm và hiển thị cảnh báo trực quan.
- Robot tự hành kiểu random-walk có đổi hướng khi gần vật cản.
- Điều khiển tạm dừng/chạy tiếp, tốc độ, tự hành, vệt di chuyển, LiDAR bật/tắt và đặt lại.
- Thống kê độ phủ làm sạch, thời gian chạy và pin ước tính.

## Cấu trúc
```text
robot-cleaner-sim/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── App.vue
    ├── main.js
    └── style.css
```

## Ghi chú kỹ thuật
LiDAR hiện dùng ray casting hình học 2D đối với tường, hai vật cản hình chữ nhật và chậu cây hình tròn; đây là cảm biến mô phỏng, không phải cảm biến vật lý thực. Collision detection lấy từ event của Matter.js. Bộ điều hướng hiện tại là random-walk đơn giản, chưa phải coverage path planning. Có thể nâng cấp tiếp bằng occupancy grid, A*, boustrophedon coverage, lidar scan matching và mô hình động học vi sai.
