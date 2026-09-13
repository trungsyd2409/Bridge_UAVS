/**
 * Điểm vào duy nhất của trợ lý AI: askAssistant(message, profile, lang).
 *
 *   câu hỏi của người dùng
 *     → NLU (intent, entities, risk, englishQuery)
 *     → Grounding song song: RAG (embed → hybrid → RRF → rerank) | bảng lương | ABN
 *     → LLM sinh câu trả lời 5 phần (hoặc mẫu dự phòng)
 *     + khối khẩn cấp tạo bằng code khi risk cao
 */
import { isFakeMode } from "./config";
import { generateAnswer, fallbackAnswer } from "./answer";
import { GeminiAuthError } from "./gemini";
import { gatherEvidence } from "./grounding";
import { analyze, cleanMessage, fallbackNlu, isSelfHarm, scanEmergency } from "./nlu";
import { contactsFor, urgentBlock } from "./support";
import type { AnswerLang, AssistantResponse, NluResult, TraceStep, UserProfile } from "./types";

export type { AssistantResponse, UserProfile } from "./types";

const DISCLAIMER: Record<AnswerLang, string> = {
  vi: "Đây là thông tin chung, không phải tư vấn pháp lý. Hãy kiểm tra lại với Fair Work Ombudsman (13 13 94) — miễn phí và có phiên dịch tiếng Việt.",
  en: "This is general information, not legal advice. Check with the Fair Work Ombudsman (13 13 94) — free, with interpreters available.",
};

const AUTH_MESSAGE =
  "API key Gemini sai hoặc thiếu: đang chạy chế độ không có AI (từ khoá + câu trả lời mẫu)";

export async function askAssistant(
  rawMessage: string,
  profile: UserProfile = {},
  lang: AnswerLang = "vi",
): Promise<{ response: AssistantResponse; trace: TraceStep[] }> {
  const trace: TraceStep[] = [];
  const message = cleanMessage(rawMessage);
  let offline = false;

  // ---- NLU ----
  let t0 = Date.now();
  let nlu: NluResult;
  try {
    const result = await analyze(message);
    nlu = result.nlu;
    trace.push({
      step: "NLU", ms: since(t0), ok: !result.error,
      detail: { model: result.model, error: result.error, ...nlu },
    });
  } catch (e) {
    if (!(e instanceof GeminiAuthError)) throw e;
    offline = true;
    nlu = fallbackNlu(message, scanEmergency(message));
    trace.push({ step: "NLU", ms: since(t0), ok: false, detail: { ...nlu, error: AUTH_MESSAGE } });
  }

  // ---- Grounding ----
  t0 = Date.now();
  const grounding = await gatherEvidence(nlu, profile, offline);
  trace.push(...grounding.trace);
  if (grounding.authError) {
    offline = true;
    trace.push({ step: "Grounding", ms: since(t0), ok: false, detail: AUTH_MESSAGE });
  }

  // ---- Câu trả lời ----
  const contacts = contactsFor(nlu.intent, profile, lang);
  t0 = Date.now();
  let answer;
  let mode: "llm" | "fallback" = "fallback";
  if (offline || isFakeMode()) {
    answer = fallbackAnswer(nlu, profile, grounding.evidence, contacts, lang);
    trace.push({
      step: "Sinh câu trả lời", ms: since(t0), ok: true,
      detail: offline ? "mẫu (không có AI)" : "mẫu (chế độ giả)",
    });
  } else {
    try {
      const result = await generateAnswer(message, nlu, profile, grounding.evidence, contacts, lang);
      answer = result.answer;
      mode = result.mode;
      trace.push({
        step: "Sinh câu trả lời", ms: since(t0), ok: result.mode === "llm",
        detail: { model: result.model, error: result.error, grounding: answer.grounding },
      });
    } catch (e) {
      if (!(e instanceof GeminiAuthError)) throw e;
      answer = fallbackAnswer(nlu, profile, grounding.evidence, contacts, lang);
      trace.push({ step: "Sinh câu trả lời", ms: since(t0), ok: false, detail: AUTH_MESSAGE });
    }
  }

  const response: AssistantResponse = {
    answer,
    sources: grounding.evidence.map((e, i) => ({
      n: i + 1,
      title: e.title,
      source: e.source,
      url: e.url,
      kind: e.kind,
      cited: answer.citations.includes(i + 1),
    })),
    urgent: urgentBlock(nlu, isSelfHarm(nlu.emergencyKeywords), lang),
    intent: nlu.intent,
    risk: nlu.risk,
    mode,
    disclaimer: DISCLAIMER[lang],
  };
  return { response, trace };
}

function since(t0: number): number {
  return Date.now() - t0;
}
