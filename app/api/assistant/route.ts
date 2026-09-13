/**
 * API của trợ lý AI:  POST /api/assistant
 *
 * Cây cầu giữa box chat trong app/page.tsx và bộ não AI ở lib/assistant/.
 * Không cần đăng nhập, không cần database.
 *
 * Gửi lên:  { message, profile: { visa, industry, employment, state }, lang: "vi" | "en" }
 * Trả về:   { response: AssistantResponse }
 *
 * Lịch sử chat do phía giao diện tự giữ (state của React). Phần AI không lưu gì cả.
 * API key nằm ở phía server (.dev.vars / biến môi trường Worker), không bao giờ ra trình duyệt.
 */
import { MAX_MESSAGE_CHARS, RATE_LIMIT, RATE_WINDOW_MS } from "@/lib/assistant/config";
import { askAssistant } from "@/lib/assistant";
import { readProfile } from "@/lib/assistant/profile";
import { checkRateLimit } from "@/lib/rate-limit";
import type { AnswerLang } from "@/lib/assistant/types";

export const dynamic = "force-dynamic";

/** Lấy IP người gọi. Sau Cloudflare thì IP thật nằm ở cf-connecting-ip. */
function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function errorText(lang: AnswerLang, vi: string, en: string): string {
  return lang === "vi" ? vi : en;
}

export async function POST(req: Request) {
  // ---- 1. Đọc dữ liệu gửi lên ----
  let body: { message?: unknown; profile?: unknown; lang?: unknown; trace?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }
  const lang: AnswerLang = body.lang === "en" ? "en" : "vi";

  // ---- 2. Chống spam ----
  const limit = checkRateLimit(`assistant:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    const seconds = Math.ceil(limit.retryAfterMs / 1000);
    return Response.json(
      {
        error: errorText(
          lang,
          `Bạn đang hỏi hơi nhanh. Vui lòng thử lại sau ${seconds} giây.`,
          `You are asking a little too quickly. Please try again in ${seconds} seconds.`,
        ),
      },
      { status: 429, headers: { "Retry-After": String(seconds) } },
    );
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return Response.json(
      { error: errorText(lang, "Bạn chưa nhập câu hỏi.", "Please type a question first.") },
      { status: 400 },
    );
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return Response.json(
      {
        error: errorText(
          lang,
          `Câu hỏi quá dài (tối đa ${MAX_MESSAGE_CHARS} ký tự).`,
          `That question is too long (maximum ${MAX_MESSAGE_CHARS} characters).`,
        ),
      },
      { status: 400 },
    );
  }

  // ---- 3. Gọi trợ lý ----
  try {
    const profile = readProfile(body.profile);
    const { response, trace } = await askAssistant(message, profile, lang);
    // trace chỉ trả khi client hỏi xin: dùng lúc demo cho giám khảo xem từng bước.
    return Response.json({ response, ...(body.trace === true ? { trace } : {}) });
  } catch (err) {
    console.error("[/api/assistant] lỗi:", err);
    return Response.json(
      {
        error: errorText(
          lang,
          "Trợ lý đang gặp sự cố. Vui lòng thử lại sau ít phút.",
          "The assistant hit a problem. Please try again in a few minutes.",
        ),
      },
      { status: 500 },
    );
  }
}

/** Mở thẳng /api/assistant bằng trình duyệt sẽ vào đây — dùng để kiểm tra route còn sống. */
export async function GET() {
  return Response.json({
    ok: true,
    hint: 'Route đang chạy. Gửi POST với body {"message":"..."} để hỏi trợ lý.',
  });
}
