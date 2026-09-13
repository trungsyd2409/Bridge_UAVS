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

## Deploy

### Cloudflare Workers (đường chính)

```bash
npx wrangler login                       # một lần
npx @vinext/cloudflare deploy
npx wrangler secret put GEMINI_API_KEY   # sau lần deploy đầu
```

`wrangler.jsonc` giữ tên Worker, ngày tương thích và binding assets; `vite.config.ts` chồng
thêm binding theo `.openai/hosting.json` lên trên.

`.dev.vars` chỉ dùng cho local — bản chạy thật đọc secret của Worker. Deploy trước khi có
secret vẫn an toàn: trợ lý tự lùi về tìm từ khoá + câu trả lời mẫu cho tới khi đặt key.
Chỉ cần thêm `account_id` vào `wrangler.jsonc` nếu tài khoản Cloudflare của bạn có nhiều account.

### Vercel

Đường Vercel đi qua plugin Nitro. `vite.config.ts` tự chọn: mặc định Cloudflare, còn khi có biến
`VERCEL`, `NITRO_PRESET` hoặc `DEPLOY_TARGET=nitro` thì chuyển sang Nitro và thay
`cloudflare:workers` bằng `process.env`. Làm một lần:

```bash
pnpm add -D nitro          # nhớ commit cả pnpm-lock.yaml
```

Rồi push repo lên GitHub và import vào Vercel. File `vercel.json` đã đặt sẵn Framework Preset
là none và build command là `vite build`; ô Output Directory để trống. Vào
Settings → Environment Variables thêm `GEMINI_API_KEY` (và `ABN_LOOKUP_GUID` nếu có) cho cả
Production, Preview và Development — Vercel không đọc file `.dev.vars`.

Dự án ghim pnpm 11 trong `packageManager`, và `pnpm-workspace.yaml` dùng cú pháp của pnpm 11
(`allowBuilds`, `strictDepBuilds`, `minimumReleaseAge`). Vercel mặc định dùng pnpm 9/10 nên sẽ
không hiểu, dễ hỏng bước install. Thêm biến môi trường `ENABLE_EXPERIMENTAL_COREPACK` = `1`
trong Settings → Environment Variables để Vercel cài bằng đúng pnpm đã ghim.

Nếu `pnpm add -D nitro` bị chặn vì luật `minimumReleaseAge` (package mới hơn 7 ngày):

```bash
pnpm add -D nitro --config.minimumReleaseAge=0
```

Muốn thử build giống Vercel ngay trên máy:

```powershell
$env:NITRO_PRESET="vercel"; npx vite build
```

Giới hạn thời gian chạy của Vercel Functions hiện là 300 giây ở mọi gói (kể cả Hobby) khi bật
Fluid compute, thừa sức cho trợ lý (chậm nhất khoảng 25 giây), nên không cần đặt `maxDuration`.

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
- `vite.config.ts`: chọn nơi deploy (Cloudflare mặc định, Nitro khi build cho Vercel).
- `vercel.json`: cấu hình sẵn cho Vercel.

## Bản tham chiếu

- Commit: `5af5caae285e8795ef2356786a842abf173c55b6`
- App beta: `https://bridge-quyen-loi.princess-thi-mai.chatgpt.site`

File ZIP không chứa `node_modules`, output build, `.git`, dữ liệu người dùng, mật khẩu hoặc API key.
