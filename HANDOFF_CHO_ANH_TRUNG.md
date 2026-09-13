# BRIDGE — bàn giao source code

Đây là source code đúng với bản BRIDGE beta được đưa lên app ngày 13/09/2026.

## Mở và chạy trong VS Code

Yêu cầu: Node.js 22.13 trở lên và pnpm.

```bash
corepack enable
pnpm install
cp .dev.vars.example .dev.vars   # roi dan GEMINI_API_KEY vao
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
- Trợ lý AI thật: câu hỏi tiếng Việt/Anh → phân loại ý định → tìm trong 239 đoạn tài liệu Fair Work
  (vector 768 chiều + BM25, gộp bằng RRF, Gemini chấm lại) → câu trả lời 5 phần kèm trích nguồn [n].
- Khối cảnh báo khẩn cấp do code tạo, không phụ thuộc AI: hỏng AI thì vẫn hiện số 000, Lifeline, TIS.
- Không có API key vẫn chạy: tự chuyển sang tìm từ khoá + câu trả lời mẫu, có ghi rõ trên giao diện.

## Những phần cần tiếp tục

- Kho kiến thức Fair Work chưa được lập phiên bản và kiểm duyệt bởi chuyên gia pháp lý.
- Chưa có công cụ tính award/mức lương chính thức (mới chỉ có bảng lương tối thiểu quốc gia).
- ABN Lookup đã có sẵn code nhưng cần ABN_LOOKUP_GUID mới chạy.
- Chống spam đang giữ trong RAM của từng Worker isolate; muốn chắc chắn thì chuyển sang Durable Object hoặc KV.
- Chưa có đăng nhập, đồng bộ nhiều thiết bị hoặc cơ sở dữ liệu người dùng.
- Chưa có voice input, upload payslip hoặc OCR.

Không đặt API key trong code phía trình duyệt hoặc commit `.dev.vars`. Key chỉ đọc ở phía server qua `lib/assistant/env.ts`; trình duyệt không bao giờ thấy nó. Mỗi câu trả lời đều kèm nguồn, và trường hợp không đủ bằng chứng thì trợ lý nói rõ là chưa đủ thông tin thay vì đoán.

## Cấu trúc quan trọng

- `app/page.tsx`: luồng giao diện chính.
- `app/work-hub.tsx`: công việc, lịch, ca làm và thanh toán.
- `app/job-fields.tsx`: ngành nghề, hình thức làm việc và ABN.
- `app/bridge-ui.tsx`: thành phần thương hiệu và trợ lý chuyển động.
- `lib/work-model.ts`: ngày giờ, DST, mã hóa và chuyển dữ liệu cũ.
- `lib/job-options.ts`: danh sách ngành nghề/hình thức làm việc.
- `app/globals.css`, `app/beta.css`: giao diện responsive và dark mode.
- `tests/work-model.test.mjs`: kiểm tra lịch, DST, mã hóa và dữ liệu cũ.
- `app/api/assistant/route.ts`: API của trợ lý AI (POST, chạy phía server).
- `lib/assistant/`: bộ não AI — `index.ts` là điểm vào, xem `lib/assistant/README.md`.
- `lib/assistant/rag-data.json`: kho tài liệu Fair Work đã xuất sẵn (239 đoạn + vector + chỉ mục BM25).
- `.dev.vars.example`: mẫu biến môi trường; chép thành `.dev.vars` rồi điền GEMINI_API_KEY.

## Bản tham chiếu

- Commit: `5af5caae285e8795ef2356786a842abf173c55b6`
- App beta: `https://bridge-quyen-loi.princess-thi-mai.chatgpt.site`

File ZIP không chứa `node_modules`, output build, `.git`, dữ liệu người dùng, mật khẩu hoặc API key.
