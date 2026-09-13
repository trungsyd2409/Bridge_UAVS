/**
 * Sinh câu trả lời 5 phần từ bằng chứng đã gom.
 * LLM chỉ được dùng thông tin trong EVIDENCE và phải trích số [n].
 * Lỗi/không có key -> mẫu trả lời dựng sẵn theo intent (vẫn hữu ích, vẫn có nguồn).
 *
 * Song ngữ: `lang` quyết định ngôn ngữ câu trả lời, theo tuỳ chọn ngôn ngữ của app.
 * Kho tài liệu vẫn là tiếng Anh; chỉ phần trả lời cho người dùng đổi ngôn ngữ.
 */
import { ANSWER_MODELS, TIMEOUT } from "./config";
import { GeminiAuthError, generateJson } from "./gemini";
import type { AnswerLang, AnswerParts, Evidence, Intent, NluResult, SupportContact, UserProfile } from "./types";
import { compareWage } from "./wages";

const SHARED_RULES = `
2. ONLY use information inside EVIDENCE. Every number (money, hours, deadlines) must come from
   EVIDENCE — never from memory.
3. citations: the numbers [n] of the evidence items the answer relies on.
4. grounding: "grounded" if EVIDENCE answers directly; "partial" if only partly; "insufficient" if
   EVIDENCE does not cover it. When "insufficient": say plainly there is not enough official
   information yet and point to CONTACTS. DO NOT guess.
5. Never state a firm legal conclusion ("you will definitely win"); use "may", "usually" where fitting.
6. whatToDo: 2-4 concrete steps the worker can take now. evidenceToKeep: 2-4 kinds of records to keep.
   whoCanHelp: choose from CONTACTS, include the phone number.
7. If the worker is worried about their visa: note that contacting Fair Work does not cancel a visa
   (only if EVIDENCE says so).
8. When evidence items disagree on a number, always trust the LOOKUP TABLE or DIRECT DATA item. If only
   page extracts disagree, say the information is not consistent and advise calling Fair Work.`;

const SYSTEM_PROMPT: Record<AnswerLang, string> = {
  vi: `Bạn là trợ lý của app BRIDGE, giúp người lao động nhập cư Việt Nam tại Úc hiểu quyền lợi nơi làm việc.

Quy tắc bắt buộc:
1. Trả lời bằng TIẾNG VIỆT đơn giản, xưng "bạn". Thuật ngữ tiếng Anh (award, payslip, casual) giữ
   nguyên nhưng giải thích ngắn.${SHARED_RULES}

Trả JSON, không thêm gì khác.`,
  en: `You are the assistant inside the BRIDGE app, helping migrant workers in Australia understand their workplace rights.

Rules:
1. Answer in PLAIN ENGLISH, addressing the worker as "you". Keep Australian terms (award, pay slip,
   casual loading) and explain each one briefly.${SHARED_RULES}

Return JSON only.`,
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    whatIsHappening: { type: "STRING" },
    whyItMatters: { type: "STRING" },
    whatToDo: { type: "ARRAY", items: { type: "STRING" } },
    evidenceToKeep: { type: "ARRAY", items: { type: "STRING" } },
    whoCanHelp: { type: "ARRAY", items: { type: "STRING" } },
    citations: { type: "ARRAY", items: { type: "INTEGER" } },
    grounding: { type: "STRING", enum: ["grounded", "partial", "insufficient"] },
  },
  required: ["whatIsHappening", "whyItMatters", "whatToDo", "evidenceToKeep", "whoCanHelp", "citations", "grounding"],
};

export function buildPrompt(
  message: string, nlu: NluResult, profile: UserProfile, evidence: Evidence[], contacts: SupportContact[],
): string {
  const ev = evidence.length
    ? evidence.map((e, i) => `[${i + 1}] (${e.source}) ${e.title}\n${e.content.slice(0, 1500)}`).join("\n\n")
    : "(no sufficiently relevant evidence)";
  const who = contacts.map((c) => `- ${c.name}${c.phone ? ` (${c.phone})` : ""}: ${c.note}`).join("\n");
  const prof = Object.entries(profile).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ") || "unknown";
  return `PROFILE: ${prof}
CLASSIFICATION: intent=${nlu.intent}, risk=${nlu.risk}

QUESTION:
${message}

EVIDENCE:
${ev}

CONTACTS:
${who}`;
}

// ---------- kiểm tra JSON ----------

const str = (v: unknown, max = 1200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const strList = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => str(x, 400)).filter((x): x is string => !!x).slice(0, 6) : [];

/** "$26.44", "$1,234", "26,44 đô" — mọi cách viết số tiền có thể xuất hiện trong câu trả lời. */
const MONEY = /\$\s?\d[\d.,]*|\b\d+[.,]\d{2}\s*(?:đô|AUD)/gi;

/** "$26.44" và "26,44 đô" đều thành "26.44" để so với nội dung bằng chứng. */
function normalizeMoney(token: string): string {
  return token.replace(/[^\d.,]/g, "").replace(/,/g, ".").replace(/\.$/, "");
}

/**
 * Mọi con số tiền trong câu trả lời phải truy được về BẰNG CHỨNG hoặc về chính CÂU HỎI
 * của người dùng (họ tự nói "chủ trả em 18 đô"). Số không truy được là số model tự nhớ —
 * với app tư vấn quyền lao động thì đó là loại sai nguy hiểm nhất.
 *
 * Trả về: null = câu trả lời không dùng được; hoặc danh sách trích dẫn đã bổ sung.
 */
function checkMoney(
  text: string, message: string, evidence: Evidence[], citations: number[],
): number[] | null {
  const money = [...new Set(text.match(MONEY) ?? [])].map(normalizeMoney).filter(Boolean);
  if (money.length === 0) return citations;

  const asked = message.replace(/,/g, ".");
  const fromEvidence = new Set<number>();
  for (const value of money) {
    let found = false;
    evidence.forEach((e, i) => {
      if (e.content.replace(/,/g, ".").includes(value)) {
        fromEvidence.add(i + 1);
        found = true;
      }
    });
    // Số người dùng tự nêu trong câu hỏi thì được phép nhắc lại mà không cần trích nguồn.
    if (!found && !asked.includes(value)) return null; // số không truy được -> bỏ câu trả lời
  }
  if (fromEvidence.size === 0) return citations; // mọi số đều đến từ câu hỏi
  // Có số lấy từ bằng chứng: bắt buộc phải trích. Model quên thì gắn hộ đúng bằng chứng chứa số đó.
  return citations.length ? citations : [...fromEvidence].sort((a, b) => a - b);
}

export function validateAnswer(raw: unknown, evidence: Evidence[], message: string): AnswerParts | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const evidenceCount = evidence.length;
  const whatIsHappening = str(r.whatIsHappening);
  const whyItMatters = str(r.whyItMatters);
  const whatToDo = strList(r.whatToDo);
  if (!whatIsHappening || !whyItMatters || whatToDo.length === 0) return null;

  let citations = Array.isArray(r.citations)
    ? [...new Set(r.citations.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= evidenceCount))]
    : [];

  const checked = checkMoney([whatIsHappening, whyItMatters, ...whatToDo].join(" "), message, evidence, citations);
  if (checked === null) return null; // có số tiền không truy được nguồn -> dùng mẫu dự phòng
  citations = checked;

  let grounding = ["grounded", "partial", "insufficient"].includes(r.grounding as string)
    ? (r.grounding as AnswerParts["grounding"])
    : "partial";
  if (evidenceCount === 0) grounding = "insufficient"; // không có bằng chứng thì không thể "grounded"
  if (grounding === "grounded" && citations.length === 0) grounding = "partial";

  return {
    whatIsHappening, whyItMatters, whatToDo,
    evidenceToKeep: strList(r.evidenceToKeep),
    whoCanHelp: strList(r.whoCanHelp),
    citations, grounding,
  };
}

// ---------- mẫu dự phòng ----------

type Template = Pick<AnswerParts, "whatIsHappening" | "whyItMatters" | "whatToDo" | "evidenceToKeep">;

const TEMPLATES_VI: Record<Intent, Template> = {
  underpayment: {
    whatIsHappening: "Có thể bạn đang được trả thấp hơn mức lương tối thiểu hoặc mức trong award (thang lương của ngành).",
    whyItMatters: "Mọi người lao động ở Úc, dù có visa gì, đều phải được trả ít nhất mức tối thiểu. Trả tiền mặt vẫn phải đủ mức này.",
    whatToDo: ["Ghi lại ngày, giờ làm và số tiền nhận mỗi tuần.", "Kiểm tra mức lương của ngành bằng công cụ Pay Calculator của Fair Work.", "Liên hệ Fair Work Ombudsman để được tư vấn miễn phí."],
    evidenceToKeep: ["Lịch làm việc / ảnh chụp roster", "Tin nhắn với chủ về lương", "Payslip hoặc biên nhận tiền mặt"],
  },
  no_payslip: {
    whatIsHappening: "Chủ không đưa payslip (phiếu lương) cho bạn.",
    whyItMatters: "Chủ phải đưa payslip sau mỗi lần trả lương, kể cả khi trả tiền mặt. Payslip là bằng chứng quan trọng nếu bị trả thiếu.",
    whatToDo: ["Nhắn tin (có lưu lại) đề nghị chủ gửi payslip.", "Tự ghi lại giờ làm và tiền nhận mỗi tuần.", "Liên hệ Fair Work Ombudsman nếu chủ vẫn không đưa."],
    evidenceToKeep: ["Tin nhắn đề nghị gửi payslip", "Sổ ghi giờ làm của bạn", "Sao kê ngân hàng"],
  },
  unsafe: {
    whatIsHappening: "Nơi làm việc của bạn có thể không an toàn.",
    whyItMatters: "Mọi người lao động có quyền được làm việc an toàn, bất kể visa. Chủ phải cung cấp đồ bảo hộ miễn phí.",
    whatToDo: ["Nếu có nguy hiểm trước mắt, dừng việc và rời khỏi chỗ nguy hiểm.", "Báo cho chủ bằng tin nhắn (có lưu lại).", "Liên hệ cơ quan an toàn lao động của bang."],
    evidenceToKeep: ["Ảnh chụp chỗ không an toàn", "Giấy khám bệnh nếu bị thương", "Tin nhắn báo cho chủ"],
  },
  visa_threat: {
    whatIsHappening: "Bạn đang lo lắng về visa liên quan đến công việc.",
    whyItMatters: "Quyền lợi lao động không phụ thuộc visa. Chủ không có quyền huỷ visa của bạn, và chủ không được giữ hộ chiếu của bạn.",
    whatToDo: ["Kiểm tra điều kiện visa của bạn trên VEVO.", "Liên hệ Fair Work Ombudsman — việc này không làm visa bị huỷ.", "Không đưa hộ chiếu cho chủ giữ."],
    evidenceToKeep: ["Tin nhắn chủ đe doạ về visa", "Ảnh chụp điều kiện visa (VEVO)", "Lịch làm việc"],
  },
  harassment: {
    whatIsHappening: "Bạn có thể đang bị quấy rối hoặc đối xử không đúng ở nơi làm việc.",
    whyItMatters: "Quấy rối tình dục và phân biệt đối xử ở nơi làm việc là trái luật. Chủ phải có biện pháp ngăn chặn.",
    whatToDo: ["Ghi lại sự việc: ngày, giờ, lời nói, người chứng kiến.", "Nói với người tin cậy.", "Liên hệ Australian Human Rights Commission."],
    evidenceToKeep: ["Tin nhắn, email", "Ghi chép sự việc", "Tên người chứng kiến"],
  },
  unfair_dismissal: {
    whatIsHappening: "Bạn có thể đã bị cho nghỉ việc không đúng.",
    whyItMatters: "Nếu cho rằng mình bị đuổi việc không công bằng, thời hạn nộp đơn lên Fair Work Commission rất ngắn.",
    whatToDo: ["Liên hệ Fair Work Commission NGAY để biết thời hạn.", "Yêu cầu chủ nói rõ lý do bằng văn bản.", "Kiểm tra bạn đã nhận đủ lương và tiền báo trước chưa."],
    evidenceToKeep: ["Tin nhắn/email báo nghỉ việc", "Payslip gần nhất", "Hợp đồng lao động"],
  },
  contract_hours: {
    whatIsHappening: "Bạn có thắc mắc về hợp đồng, giờ làm hoặc hình thức làm việc (ví dụ bị yêu cầu làm ABN).",
    whyItMatters: "Bị ép làm contractor dùng ABN trong khi thực chất là nhân viên có thể là sham contracting — trái luật.",
    whatToDo: ["Đọc kỹ giấy tờ trước khi ký.", "Ghi lại giờ làm, ai phân công việc, ai cung cấp dụng cụ.", "Hỏi Fair Work Ombudsman về hình thức làm việc của bạn."],
    evidenceToKeep: ["Hợp đồng hoặc thư mời làm việc", "Roster / lịch làm", "Tin nhắn về ABN"],
  },
  general: {
    whatIsHappening: "Mình chưa xác định rõ vấn đề của bạn.",
    whyItMatters: "Mọi người lao động ở Úc đều có quyền lợi cơ bản như nhau, dù có visa gì.",
    whatToDo: ["Mô tả thêm: bạn làm ngành gì, vấn đề là lương, giờ làm, an toàn hay visa?", "Liên hệ Fair Work Ombudsman nếu cần tư vấn ngay."],
    evidenceToKeep: ["Lịch làm việc", "Tin nhắn với chủ", "Payslip"],
  },
};

const TEMPLATES_EN: Record<Intent, Template> = {
  underpayment: {
    whatIsHappening: "You may be paid below the national minimum wage or below your award rate (your industry's pay scale).",
    whyItMatters: "Every worker in Australia, on any visa, must be paid at least the minimum. Being paid in cash does not change that.",
    whatToDo: ["Write down the dates, hours worked and the amount you receive each week.", "Check your industry rate with the Fair Work Pay Calculator.", "Contact the Fair Work Ombudsman for free advice."],
    evidenceToKeep: ["Your roster or photos of it", "Messages with your employer about pay", "Pay slips or cash receipts"],
  },
  no_payslip: {
    whatIsHappening: "Your employer is not giving you pay slips.",
    whyItMatters: "Employers must give a pay slip after every payment, including cash payments. A pay slip is key evidence if you are underpaid.",
    whatToDo: ["Ask for your pay slips in writing (a text message you can keep).", "Record your own hours and payments each week.", "Contact the Fair Work Ombudsman if the pay slips still do not arrive."],
    evidenceToKeep: ["Your written request for pay slips", "Your own record of hours", "Bank statements"],
  },
  unsafe: {
    whatIsHappening: "Your workplace may not be safe.",
    whyItMatters: "Every worker has the right to a safe workplace, whatever their visa. Employers must supply protective equipment free of charge.",
    whatToDo: ["If there is immediate danger, stop and move away from it.", "Report it to your employer in writing (keep a copy).", "Contact your state's work health and safety regulator."],
    evidenceToKeep: ["Photos of the unsafe conditions", "Medical records if you were hurt", "Messages reporting it to your employer"],
  },
  visa_threat: {
    whatIsHappening: "You are worried about your visa in relation to your job.",
    whyItMatters: "Workplace rights do not depend on your visa. An employer cannot cancel your visa, and cannot keep your passport.",
    whatToDo: ["Check your visa conditions on VEVO.", "Contact the Fair Work Ombudsman — doing so does not cancel your visa.", "Do not hand your passport to your employer."],
    evidenceToKeep: ["Messages where your employer mentions your visa", "A screenshot of your visa conditions (VEVO)", "Your roster"],
  },
  harassment: {
    whatIsHappening: "You may be experiencing harassment or unfair treatment at work.",
    whyItMatters: "Sexual harassment and discrimination at work are against the law. Employers must take steps to prevent them.",
    whatToDo: ["Write down each incident: date, time, what was said, who saw it.", "Tell someone you trust.", "Contact the Australian Human Rights Commission."],
    evidenceToKeep: ["Messages and emails", "Your written record of incidents", "Names of witnesses"],
  },
  unfair_dismissal: {
    whatIsHappening: "You may have been dismissed unfairly.",
    whyItMatters: "If you believe your dismissal was unfair, the deadline to apply to the Fair Work Commission is very short.",
    whatToDo: ["Contact the Fair Work Commission NOW to check the deadline.", "Ask your employer for the reason in writing.", "Check that you received all your pay and any notice owed."],
    evidenceToKeep: ["The message or email ending your job", "Your most recent pay slip", "Your employment contract"],
  },
  contract_hours: {
    whatIsHappening: "You have a question about your contract, hours or employment type (for example being asked to work on an ABN).",
    whyItMatters: "Being pushed onto an ABN as a contractor while really working as an employee can be sham contracting, which is unlawful.",
    whatToDo: ["Read any document carefully before signing.", "Record your hours, who directs your work and who supplies the tools.", "Ask the Fair Work Ombudsman about your employment type."],
    evidenceToKeep: ["Your contract or job offer", "Your roster", "Messages about the ABN"],
  },
  general: {
    whatIsHappening: "I am not sure yet what the problem is.",
    whyItMatters: "Every worker in Australia has the same basic rights, whatever their visa.",
    whatToDo: ["Tell me a bit more: what industry do you work in, and is this about pay, hours, safety or your visa?", "Contact the Fair Work Ombudsman if you need advice right away."],
    evidenceToKeep: ["Your roster", "Messages with your employer", "Pay slips"],
  },
};

const TEMPLATES: Record<AnswerLang, Record<Intent, Template>> = { vi: TEMPLATES_VI, en: TEMPLATES_EN };

export function fallbackAnswer(
  nlu: NluResult, profile: UserProfile, evidence: Evidence[], contacts: SupportContact[], lang: AnswerLang,
): AnswerParts {
  const t = TEMPLATES[lang][nlu.intent];
  let whatIsHappening = t.whatIsHappening;
  const rate = nlu.entities.hourlyRate;
  if (rate !== undefined && nlu.intent === "underpayment") {
    const cmp = compareWage(rate, profile.employment === "casual");
    if (lang === "vi") {
      whatIsHappening = cmp.shortfallPerHour > 0
        ? `Bạn nói được trả $${rate.toFixed(2)}/giờ — thấp hơn mức tối thiểu ${cmp.isCasual ? "cho casual " : ""}$${cmp.minimum.toFixed(2)}/giờ khoảng $${cmp.shortfallPerHour.toFixed(2)} mỗi giờ.`
        : `Bạn nói được trả $${rate.toFixed(2)}/giờ, không thấp hơn mức tối thiểu quốc gia $${cmp.minimum.toFixed(2)}/giờ — nhưng award của ngành bạn có thể cao hơn.`;
    } else {
      whatIsHappening = cmp.shortfallPerHour > 0
        ? `You said you are paid $${rate.toFixed(2)}/hour — about $${cmp.shortfallPerHour.toFixed(2)}/hour below the ${cmp.isCasual ? "casual " : ""}minimum of $${cmp.minimum.toFixed(2)}/hour.`
        : `You said you are paid $${rate.toFixed(2)}/hour, which is not below the national minimum of $${cmp.minimum.toFixed(2)}/hour — but your industry award may require more.`;
    }
  }
  // Mẫu dự phòng là văn bản VIẾT SẴN, không rút ra từ chunk RAG. Trích [n] trỏ vào chunk RAG
  // ở đây là gán nguồn cho chữ không lấy từ nguồn đó — người dùng bấm vào sẽ thấy tài liệu
  // chẳng liên quan. Chỉ trích nguồn tra bảng (lương) hoặc API (ABN) vì whatIsHappening
  // ở trên thật sự được tính từ chúng.
  const cited = evidence
    .map((e, i) => ({ kind: e.kind, n: i + 1 }))
    .filter((x) => x.kind !== "rag")
    .map((x) => x.n)
    .slice(0, 3);
  return {
    ...t,
    whatIsHappening,
    whoCanHelp: contacts.map((c) => `${c.name}${c.phone ? ` — ${c.phone}` : ""}`),
    citations: cited,
    grounding: cited.length ? "partial" : "insufficient",
  };
}

export async function generateAnswer(
  message: string, nlu: NluResult, profile: UserProfile, evidence: Evidence[],
  contacts: SupportContact[], lang: AnswerLang,
): Promise<{ answer: AnswerParts; mode: "llm" | "fallback"; model?: string; error?: string }> {
  try {
    const { data, model } = await generateJson<unknown>({
      models: ANSWER_MODELS(),
      system: SYSTEM_PROMPT[lang],
      prompt: buildPrompt(message, nlu, profile, evidence, contacts),
      schema: SCHEMA,
      timeoutMs: TIMEOUT.answer,
      // 0 = ép model bám sát EVIDENCE. 0.2 cho phép nó "tự do diễn đạt" — với số liệu luật thì đó là bịa.
      temperature: 0,
    });
    const answer = validateAnswer(data, evidence, message);
    if (answer) return { answer, mode: "llm", model };
    return {
      answer: fallbackAnswer(nlu, profile, evidence, contacts, lang),
      mode: "fallback",
      error: "JSON câu trả lời không hợp lệ",
    };
  } catch (e) {
    if (e instanceof GeminiAuthError) throw e;
    return {
      answer: fallbackAnswer(nlu, profile, evidence, contacts, lang),
      mode: "fallback",
      error: (e as Error).message,
    };
  }
}
