# Chấm Mini-CEX – Y3

Công cụ chấm Mini-CEX (tư vấn người bệnh, hỏi bệnh sử, khám thực thể chuyên biệt, đánh giá người bệnh hậu phẫu và gọi báo
ISBAR) cho sinh viên Y3 thực tập Ngoại khoa, Tổ bộ môn Ngoại – BV. Nhân dân Gia Định
(Trường Đại học Y khoa Phạm Ngọc Thạch).

Địa chỉ: https://drlekimlong-svg.github.io/minicex-y3/

## Dùng thế nào

1. Nhập mật khẩu (do người phụ trách cung cấp). Trên máy cá nhân có thể chọn "Ghi nhớ trên thiết bị này".
2. Chọn loại Mini-CEX và tình huống: tư vấn người bệnh (TV01–TV12), hỏi bệnh sử (HB01–HB12) hoặc khám thực thể
   chuyên biệt (KT01–KT06: bụng, bẹn – bìu, thăm trực tràng, vết mổ – dẫn lưu, hệ tiết niệu, mạch chi dưới) hoặc hậu
   phẫu xấu đi – ISBAR (HP01–HP12, mô phỏng có diễn tiến); xem phiếu sinh viên, kịch bản, hướng dẫn tổ chức hoặc thẻ dữ
   kiện, điểm dạy và đáp án để đối chiếu.
3. Nhập sinh viên, MSSV, lớp, tổ, đợt, năm học, khoa, lượt Mini-CEX, giảng viên, người đóng vai.
4. Quan sát: đồng hồ (báo ở phút 8, 10, 12), phiếu cho sinh viên đọc (1–2 phút), đánh dấu điểm then chốt, lỗi nghiêm
   trọng, ghi chú nhanh.
5. Chấm 7 lĩnh vực (100 điểm, thang riêng cho từng loại): chọn mức rồi chọn điểm; lĩnh vực 3 theo điểm then chốt; hỏi
   bệnh sử có lĩnh vực 7 chấm qua 2 phút trình bày; lỗi nghiêm trọng khóa mức Chưa đạt; nhận định chung và mức giám sát.
6. Phản hồi hỏi – nói – hỏi, chữ ký trên màn hình, tạo phiếu PDF để tải hoặc gửi cho sinh viên (Zalo, email trên
   điện thoại).

Bản ghi chấm lưu trong trình duyệt của máy đang dùng (IndexedDB), không gửi lên máy chủ. Trang chủ có xuất bảng điểm
CSV (kèm tổng hợp theo sinh viên), sao lưu JSON và nhập JSON từ máy khác để gộp dữ liệu của nhiều giảng viên.

## Dữ liệu

`data.enc.json` là bốn bộ tình huống và thang đánh giá đã mã hóa AES-256-GCM, khóa sinh từ mật khẩu bằng
PBKDF2-SHA256 (600 000 vòng). Kho này không chứa bản rõ của tình huống hay kịch bản người đóng vai.
Thư viện tạo PDF: pdfmake 0.2.23 (MIT), font Roboto (Apache 2.0), lưu trong `vendor/`.

Bộ tình huống, kịch bản và thang đánh giá được soạn với sự hỗ trợ của Claude (Anthropic); giảng viên biên soạn
rà soát và chịu trách nhiệm nội dung. Cần Tổ bộ môn thẩm định trước khi dùng chính thức.
