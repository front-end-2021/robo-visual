### Cách hoạt động sau khi nâng cấp:
1. **Đồ đạc đa dạng (`createObstacles`):** Mỗi khi reset hoặc tải lại trang, hệ thống tự động sinh ra các khối tĩnh (Static Bodies) gồm các hình chữ nhật (bàn, tủ) và hình tròn (chân ghế, chậu cây) với góc nghiêng và kích thước ngẫu nhiên.
2. **Thuật toán xử lý bụi thông minh:** Các hạt bụi vàng chỉ được rải ở khoảng trống trên sàn, tự động tránh việc xuất hiện ẩn dưới gầm cứng của vật cản, giúp hiển thị trực quan hơn.
3. **Phản xạ va chạm đa điểm:** Robot không chỉ nảy ở 4 bức tường bao nữa, nó có thể va chạm với bất kỳ góc cạnh nào của nội thất trong nhà. Khi đâm trúng, robot sẽ chọn giải pháp ôm cua (`WALL_FOLLOW`) quanh vật cản đó để hút hết bụi bẩn tích tụ quanh chân đồ đạc rồi mới đổi hướng đi tiếp.

<FollowUp>
Bây giờ phòng đã có đầy đủ nội thất và vật cản rất sinh động rồi. Bước tiếp theo bạn muốn làm gì:
* Vẽ thêm một **vệt mờ nét vẽ (Trail)** đi sau đuôi robot để thấy rõ đường đi và những góc nào robot đã lau sạch?
* Thêm tính năng cho phép người dùng **click chuột vào màn hình để tự đặt thêm vật cản mới** theo ý muốn?

src/
├── assets/          # Chứa hình ảnh robot, bụi bẩn (nếu có)
├── components/
│   └── SimulationCanvas.vue  # Component chứa toàn bộ logic mô phỏng
├── App.vue
└── main.js
