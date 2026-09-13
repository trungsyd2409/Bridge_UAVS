# Bộ não trợ lý AI của BRIDGE

Chuyển từ `bridge_demo_1` (Next.js chạy trên Node) sang BRIDGE (Next.js chạy trên
Cloudflare Workers qua vinext). Cùng một luồng xử lý, nhưng hai chỗ phải viết lại vì
Worker không có Node runtime đầy đủ.

## Luồng một câu hỏi

```
câu hỏi (VI hoặc EN)
  │
  ├─ nlu.ts       phân loại: intent, entities, risk, và viết lại thành câu tìm kiếm tiếng Anh
  │               + quét từ khoá khẩn cấp bằng code (không cần AI, không cần mạng)
  │
  ├─ grounding.ts gom bằng chứng từ 3 nguồn CÙNG LÚC, xếp theo độ tin cậy:
  │     priority 1  abn.ts        ABN Lookup (API trực tiếp)
  │     priority 2  wages.ts      bảng lương tối thiểu (tra bảng, tính bằng code)
  │     priority 3  retrieval.ts  RAG: embed → vector + BM25 → RRF → rerank.ts
  │
  ├─ answer.ts    LLM viết câu trả lời 5 phần, CHỈ dùng bằng chứng ở trên, bắt buộc trích [n]
  │
  └─ support.ts   khối khẩn cấp + danh bạ hỗ trợ, tạo bằng code
```

Điểm vào duy nhất: `askAssistant(message, profile, lang)` trong `index.ts`.
API gọi nó: `app/api/assistant/route.ts`.

## Hai chỗ khác bản gốc

**1. Không còn `node:sqlite`.** Bản gốc mở `data/rag.db` bằng `node:sqlite`; Worker không
có module đó. Toàn bộ rag.db đã được xuất sẵn ra `rag-data.json`:

| phần         | nội dung                                                        |
|--------------|-----------------------------------------------------------------|
| `chunks`     | 239 đoạn văn + metadata để lọc theo hồ sơ (visa/ngành/hình thức) |
| `embeddings` | 239 × 768 số float32, gói base64, vector đã chuẩn hoá L2         |
| `bm25`       | chỉ mục nghịch đảo lấy TRỰC TIẾP từ tokenizer FTS5 của SQLite    |

`retrieval.ts` chấm điểm BM25 bằng đúng công thức của `bm25()` trong SQLite FTS5
(k1 = 1.2, b = 0.75, tiêu đề nặng gấp đôi nội dung), và `porter.ts` là bản TypeScript của
tokenizer `porter unicode61`. Đã đối chiếu với SQLite: thứ hạng trùng khớp trên 11 truy vấn
mẫu (sai số điểm < 1e-14), cắt gốc khớp 100% trên toàn bộ 2.227 từ của kho tài liệu.

**2. Không còn SDK `@google/genai`.** `gemini.ts` gọi thẳng REST API bằng `fetch`.
Ít hơn một dependency, và `fetch` là thứ Worker chạy tốt nhất.

## Cập nhật kho tài liệu

`rag-data.json` được sinh ra từ `data/rag.db` của pipeline bên `bridge_demo_1`. Build lại
rag.db xong thì xuất lại file này (script xuất nằm cùng chỗ với pipeline). Nhớ giữ
`embed_dim = 768` và cùng model embedding, nếu không vector câu hỏi sẽ không so được với
vector trong kho — `retrieval.ts` sẽ báo lỗi ngay lúc khởi động thay vì trả kết quả sai.

## Nguyên tắc đã cố ý giữ

- **Số liệu không do model nhớ.** Mọi con số tiền trong câu trả lời phải truy được về bằng
  chứng hoặc về chính lời người dùng; không truy được thì bỏ cả câu trả lời và dùng mẫu.
- **Khối khẩn cấp không phụ thuộc AI.** Gemini hỏng, hết quota, sai key — người đang gặp
  nguy vẫn thấy số 000, Lifeline và TIS National.
- **Không đủ bằng chứng thì nói là không đủ.** `grounding: "insufficient"` được đẩy ra giao
  diện, không giấu.
- **Mẫu dự phòng không trích nguồn RAG.** Văn bản viết sẵn không rút ra từ chunk nào, nên
  chỉ trích nguồn tra bảng (lương) hoặc API (ABN).
- **API key chỉ ở phía server.** Đọc qua `env.ts`; trình duyệt không bao giờ thấy.

## Biến môi trường

Xem `.dev.vars.example` ở gốc dự án.
