/**
 * Gọi Gemini bằng REST + fetch (KHÔNG dùng SDK @google/genai).
 *
 * Vì sao: BRIDGE chạy trên Cloudflare Workers. SDK của Google kéo theo nhiều
 * module Node; fetch thì Worker hỗ trợ sẵn, lại không thêm dependency nào.
 *
 * - Mỗi lời gọi có timeout (AbortSignal) để một bước chậm không làm treo cả API.
 * - Lỗi API key -> GeminiAuthError (không thử lại, không thử model khác).
 * - Chế độ giả (RAG_FAKE_GEMINI=1): embedding bằng băm từ khoá, chạy được offline.
 */
import { EMBED_DIM, EMBED_MODEL, isFakeMode } from "./config";
import { readEnv } from "./env";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiAuthError extends Error {}
export class GeminiTimeoutError extends Error {}
export class ModelUnavailableError extends Error {}

function apiKey(): string {
  const key = readEnv("GEMINI_API_KEY");
  if (!key) {
    throw new GeminiAuthError(
      "Thiếu GEMINI_API_KEY. Thêm vào .dev.vars khi chạy local, hoặc vào biến môi trường của Worker khi deploy.",
    );
  }
  return key;
}

function isAbort(error: unknown): boolean {
  const name = (error as Error)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

/** Chuẩn hoá lỗi thành 3 loại dễ xử lý ở lớp trên. */
function translateError(error: unknown, what: string): Error {
  if (error instanceof GeminiAuthError || error instanceof ModelUnavailableError) return error;
  if (isAbort(error)) return new GeminiTimeoutError(`${what} quá thời gian cho phép`);
  return error instanceof Error ? error : new Error(String(error));
}

/** Gọi REST một lần, dịch mã lỗi HTTP thành các lớp lỗi ở trên. */
async function callApi(
  model: string,
  method: "generateContent" | "embedContent",
  body: unknown,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_ROOT}/${model}:${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, 400);
    // CHỈ coi là lỗi API key khi chính Google nói vậy. Một proxy công ty chặn đường ra cũng
    // trả 403 — báo nhầm "sai API key" sẽ khiến bạn đi sửa nhầm chỗ.
    const saysKey = /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|API_KEY_SERVICE_BLOCKED/i.test(text);
    if (response.status === 401 || (response.status === 403 && saysKey) || saysKey) {
      throw new GeminiAuthError(`Google từ chối GEMINI_API_KEY: ${text || response.status}`);
    }
    if (response.status === 404 || /NOT_FOUND|no longer available|is not found|not supported/i.test(text)) {
      throw new ModelUnavailableError(`${model}: ${response.status} ${text}`);
    }
    throw new Error(`${model}: HTTP ${response.status} ${text}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

// ---------------- Vector ----------------

/** Chia vector cho độ dài của nó (L2). Bắt buộc khi cắt Matryoshka còn 768 chiều. */
export function l2Normalize(values: ArrayLike<number>): Float32Array {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i] * values[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i] / norm;
  return out;
}

const WORD = /[a-zA-ZÀ-ỹ0-9]+/g;

/**
 * Băm 32-bit đơn giản (FNV-1a) thay cho MD5 của bản gốc: Worker không có
 * createHash đồng bộ. Chỉ dùng cho chế độ giả — kết quả không cần khớp pipeline,
 * chỉ cần ổn định để thử giao diện khi chưa có API key.
 */
function hashWord(word: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function fakeEmbed(text: string): Float32Array {
  const vec = new Float64Array(EMBED_DIM);
  for (const word of text.toLowerCase().match(WORD) ?? []) {
    const hash = hashWord(word);
    vec[hash % EMBED_DIM] += (hash >>> 20) % 2 === 1 ? 1 : -1;
  }
  if (vec.every((v) => v === 0)) vec[0] = 1;
  return l2Normalize(vec);
}

/** Embed câu hỏi: task RETRIEVAL_QUERY, 768 chiều, đã chuẩn hoá L2. */
export async function embedQuery(text: string, timeoutMs: number): Promise<Float32Array> {
  if (isFakeMode()) return fakeEmbed(text);
  try {
    const data = await callApi(
      EMBED_MODEL,
      "embedContent",
      {
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        // KHÔNG ĐƯỢC THIẾU: phải khớp số chiều của vector trong rag-data.json
        outputDimensionality: EMBED_DIM,
      },
      timeoutMs,
    );
    const values = (data.embedding as { values?: number[] } | undefined)?.values;
    if (!values || values.length !== EMBED_DIM) {
      throw new Error(`Gemini trả về vector ${values?.length ?? 0} chiều, cần ${EMBED_DIM}`);
    }
    return l2Normalize(values);
  } catch (error) {
    throw translateError(error, "embedding");
  }
}

// ---------------- Sinh JSON ----------------

export interface GenerateOptions {
  models: string[]; // thử lần lượt: model đầu lỗi (không phải lỗi key) thì dùng model sau
  system: string;
  prompt: string;
  schema: object;
  timeoutMs: number;
  temperature?: number;
}

// Model bị Google trả 404 (không tồn tại / "no longer available to new users"):
// ghi nhớ để các câu hỏi sau bỏ qua, không tốn thêm một lần gọi bị từ chối.
const unavailableModels = new Set<string>();

/** Dùng trong test. */
export function resetUnavailableModels(): void {
  unavailableModels.clear();
}

function extractText(data: Record<string, unknown>): string {
  const candidates = data.candidates as
    | { content?: { parts?: { text?: string }[] } }[]
    | undefined;
  const parts = candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("").trim();
}

/** Gọi model sinh văn bản, ép trả JSON đúng schema. Trả về object và tên model đã dùng. */
export async function generateJson<T>(options: GenerateOptions): Promise<{ data: T; model: string }> {
  let lastError: Error = new Error("Không có model nào để gọi");
  const candidates = options.models.filter((m) => !unavailableModels.has(m));
  // Nếu tất cả đều từng lỗi 404 thì vẫn thử lại (có thể model vừa được mở lại)
  for (const model of candidates.length ? candidates : options.models) {
    try {
      const data = await callApi(
        model,
        "generateContent",
        {
          systemInstruction: { parts: [{ text: options.system }] },
          contents: [{ role: "user", parts: [{ text: options.prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: options.schema,
            temperature: options.temperature ?? 0,
          },
        },
        options.timeoutMs,
      );
      const text = extractText(data);
      if (!text) throw new Error(`${model} trả về rỗng`);
      return { data: JSON.parse(text) as T, model };
    } catch (error) {
      if (error instanceof ModelUnavailableError) unavailableModels.add(model);
      lastError = translateError(error, model);
      if (lastError instanceof GeminiAuthError) throw lastError; // sai key: model khác cũng vậy
    }
  }
  throw lastError;
}
