/**
 * Kiểu dữ liệu dùng chung cho trợ lý AI của Bridge.
 * Intent = 8 nhãn vấn đề, khớp với cột `topic` trong rag-data.json.
 *
 * File này KHÔNG import gì từ runtime server, nên client component cũng
 * `import type` được (xem app/page.tsx).
 */

export const INTENTS = [
  "underpayment",
  "no_payslip",
  "unsafe",
  "visa_threat",
  "harassment",
  "unfair_dismissal",
  "contract_hours",
  "general",
] as const;
export type Intent = (typeof INTENTS)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Ngôn ngữ câu trả lời. Lấy theo tuỳ chọn ngôn ngữ của app. */
export type AnswerLang = "vi" | "en";

/** Hồ sơ onboarding đã chuẩn hoá về mã taxonomy. Giá trị lạ bị bỏ. */
export interface UserProfile {
  visa?: "student" | "whv" | "temp_work" | "pr";
  industry?: "hospitality" | "beauty" | "cleaning" | "retail" | "farm";
  employment?: "casual" | "part_time" | "full_time" | "contractor";
  state?: string; // NSW, VIC... dùng để gợi ý cơ quan theo bang
}

export interface NluEntities {
  employer?: string;
  amount?: number; // số tiền (AUD) người dùng nhắc tới
  hourlyRate?: number; // lương theo giờ nếu nói rõ
  hours?: number;
  visaType?: string;
  abn?: string;
}

export interface NluResult {
  intent: Intent;
  entities: NluEntities;
  risk: RiskLevel;
  needsReferral: boolean;
  englishQuery: string; // câu hỏi viết lại bằng tiếng Anh, dùng cho RAG
  emergencyKeywords: string[]; // từ khoá khẩn cấp tìm thấy ở bước 2
  source: "gemini" | "fallback";
}

/** Một bằng chứng. priority: 1 = API trực tiếp, 2 = dữ liệu tra bảng, 3 = RAG. */
export interface Evidence {
  kind: "api" | "db" | "rag";
  priority: 1 | 2 | 3;
  title: string;
  content: string;
  source: string;
  url?: string;
  score?: number; // điểm rerank (RAG) nếu có
  chunkId?: string;
}

export interface SearchHit {
  id: number;
  chunkId: string;
  docId: string;
  contextHeader: string;
  content: string;
  url: string;
  source: string;
  topic: string;
  subtopic: string;
  vectorScore?: number;
  vectorRank?: number;
  keywordRank?: number;
  rrfScore: number;
  rerankScore?: number;
}

export interface AnswerParts {
  whatIsHappening: string;
  whyItMatters: string;
  whatToDo: string[];
  evidenceToKeep: string[];
  whoCanHelp: string[];
  citations: number[]; // số thứ tự bằng chứng [1], [2]... mà câu trả lời dựa vào
  grounding: "grounded" | "partial" | "insufficient";
}

export interface SupportContact {
  name: string;
  phone?: string;
  url?: string;
  note: string;
}

export interface AssistantSource {
  n: number;
  title: string;
  source: string;
  url?: string;
  kind: Evidence["kind"];
  cited: boolean;
}

export interface AssistantResponse {
  answer: AnswerParts;
  sources: AssistantSource[];
  urgent: { show: boolean; message: string; contacts: SupportContact[] };
  intent: Intent;
  risk: RiskLevel;
  mode: "llm" | "fallback";
  disclaimer: string;
}

/** Nhật ký từng bước: bật bằng `{"trace":true}` khi demo cho giám khảo xem. */
export interface TraceStep {
  step: string;
  ms: number;
  ok: boolean;
  detail?: unknown;
}
