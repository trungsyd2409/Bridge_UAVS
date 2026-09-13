# BRIDGE — bàn giao source code

Đây là source code đúng với bản BRIDGE beta được đưa lên app ngày 13/09/2026.

## Mở và chạy trong VS Code

Yêu cầu: Node.js 22.13 trở lên và pnpm.

```bash
corepack enable
pnpm install
pnpm dev
```

Sau đó mở `http://localhost:3000` hoặc `http://localhost:3000/home`.

Nếu máy chưa dùng được `corepack`, cài pnpm theo hướng dẫn tại `https://pnpm.io/installation`, rồi chạy hai lệnh cuối.

## Kiểm tra trước khi sửa hoặc bàn giao tiếp

```bash
node node_modules/typescript/bin/tsc --noEmit
node --test tests/work-model.test.mjs
pnpm build
```

## Những phần đã hoạt động

- Giao diện responsive cho điện thoại và máy tính.
- Onboarding 5 bước: ngôn ngữ, biệt danh, ngành nghề, hình thức làm việc và visa.
- Việt/Anh, sáng/tối/theo thiết bị, giảm chuyển động.
- Lịch tuần/tháng đúng năm, năm nhuận, múi giờ Úc và DST.
- Thêm nhiều công việc, nhiều địa điểm và nhiều ca trong ngày.
- Ca dự kiến/thực tế, ca qua đêm, nghỉ không lương, thanh toán và payslip.
- Nhật ký mã hóa trên thiết bị bằng mật khẩu riêng.
- ABN tùy chọn và dẫn sang ABN Lookup để người dùng tự đối chiếu.
- Animation mở app và trợ lý Bridge chuyển động.

## Những phần cần tiếp tục

- Chat hiện là hướng dẫn mẫu theo chủ đề; chưa kết nối LLM/RAG thật.
- Chưa có kho kiến thức Fair Work được lập phiên bản và kiểm duyệt.
- Chưa có công cụ tính award/mức lương chính thức.
- ABN chưa tự lấy kết quả từ ABN Lookup API.
- Chưa có đăng nhập, đồng bộ nhiều thiết bị hoặc cơ sở dữ liệu người dùng.
- Chưa có voice input, upload payslip hoặc OCR.

Không đặt API key trong code phía trình duyệt hoặc commit `.env`. Nếu thêm AI, hãy giữ key ở phía server, trích nguồn cho từng câu trả lời và chuyển các trường hợp không chắc chắn sang hỗ trợ con người.

## Cấu trúc quan trọng

- `app/page.tsx`: luồng giao diện chính.
- `app/work-hub.tsx`: công việc, lịch, ca làm và thanh toán.
- `app/job-fields.tsx`: ngành nghề, hình thức làm việc và ABN.
- `app/bridge-ui.tsx`: thành phần thương hiệu và trợ lý chuyển động.
- `lib/work-model.ts`: ngày giờ, DST, mã hóa và chuyển dữ liệu cũ.
- `lib/job-options.ts`: danh sách ngành nghề/hình thức làm việc.
- `app/globals.css`, `app/beta.css`: giao diện responsive và dark mode.
- `tests/work-model.test.mjs`: kiểm tra lịch, DST, mã hóa và dữ liệu cũ.

## Bản tham chiếu

- Commit: `5af5caae285e8795ef2356786a842abf173c55b6`
- App beta: `https://bridge-quyen-loi.princess-thi-mai.chatgpt.site`

File ZIP không chứa `node_modules`, output build, `.git`, dữ liệu người dùng, mật khẩu hoặc API key.
