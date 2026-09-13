/**
 * Danh bạ hỗ trợ theo intent + khối cảnh báo khẩn cấp.
 * Khối khẩn cấp được tạo bằng CODE, không phụ thuộc LLM: kể cả khi Gemini lỗi,
 * người đang gặp nguy vẫn thấy số điện thoại cần gọi.
 *
 * Song ngữ: chọn theo tuỳ chọn ngôn ngữ của app (Settings -> Language).
 */
import type { AnswerLang, Intent, NluResult, SupportContact, UserProfile } from "./types";

type Bilingual = { vi: string; en: string };

interface ContactSeed {
  name: string;
  phone?: string;
  url?: string;
  note: Bilingual;
}

const C = {
  fwo: {
    name: "Fair Work Ombudsman", phone: "13 13 94", url: "https://www.fairwork.gov.au",
    note: {
      vi: "Lương, payslip, quyền lợi — miễn phí, không ảnh hưởng visa",
      en: "Pay, pay slips, entitlements — free, and contacting them does not affect your visa",
    },
  },
  fwc: {
    name: "Fair Work Commission", phone: "1300 799 675", url: "https://www.fwc.gov.au",
    note: { vi: "Khiếu nại bị đuổi việc — thời hạn 21 ngày", en: "Dismissal claims — 21-day deadline" },
  },
  ahrc: {
    name: "Australian Human Rights Commission", phone: "1300 656 419", url: "https://humanrights.gov.au",
    note: { vi: "Quấy rối, phân biệt đối xử", en: "Harassment and discrimination" },
  },
  safeWorkNsw: {
    name: "SafeWork NSW", phone: "13 10 50", url: "https://www.safework.nsw.gov.au",
    note: { vi: "An toàn lao động tại NSW", en: "Work health and safety in NSW" },
  },
  safeWorkAus: {
    name: "Safe Work Australia", url: "https://www.safeworkaustralia.gov.au",
    note: { vi: "Tìm cơ quan an toàn lao động của bang bạn", en: "Find the work safety regulator for your state" },
  },
  tis: {
    name: "TIS National", phone: "131 450",
    note: {
      vi: "Phiên dịch tiếng Việt miễn phí khi gọi các cơ quan trên",
      en: "Free interpreter when you call any of the services above",
    },
  },
  emergency: {
    name: "Emergency / Police", phone: "000",
    note: { vi: "Khi đang gặp nguy hiểm", en: "If you are in immediate danger" },
  },
  police: {
    name: "Police (non-emergency)", phone: "131 444",
    note: { vi: "Báo việc bị giữ hộ chiếu, đe doạ", en: "Report a held passport or threats" },
  },
  lifeline: {
    name: "Lifeline", phone: "13 11 14",
    note: { vi: "Hỗ trợ tâm lý 24/7", en: "24/7 crisis support" },
  },
} satisfies Record<string, ContactSeed>;

function localise(seed: ContactSeed, lang: AnswerLang): SupportContact {
  return { name: seed.name, phone: seed.phone, url: seed.url, note: seed.note[lang] };
}

export function contactsFor(intent: Intent, profile: UserProfile, lang: AnswerLang): SupportContact[] {
  const safety = profile.state?.toUpperCase() === "NSW" ? C.safeWorkNsw : C.safeWorkAus;
  const byIntent: Record<Intent, ContactSeed[]> = {
    underpayment: [C.fwo],
    no_payslip: [C.fwo],
    visa_threat: [C.fwo],
    contract_hours: [C.fwo],
    unfair_dismissal: [C.fwc, C.fwo],
    unsafe: [safety, C.fwo],
    harassment: [C.ahrc, C.fwo],
    general: [C.fwo],
  };
  return [...byIntent[intent], C.tis].map((seed) => localise(seed, lang));
}

const URGENT_SELF_HARM: Bilingual = {
  vi: "Nếu bạn đang nghĩ đến việc làm hại bản thân, hãy gọi ngay Lifeline hoặc 000. Bạn không phải đối mặt một mình.",
  en: "If you are thinking about harming yourself, call Lifeline or 000 now. You do not have to face this alone.",
};

const URGENT_HIGH_RISK: Bilingual = {
  vi: "Tình huống của bạn có dấu hiệu nghiêm trọng. Nếu đang gặp nguy hiểm, gọi 000 ngay. Liên hệ các cơ quan dưới đây càng sớm càng tốt — gọi họ KHÔNG làm visa của bạn bị huỷ.",
  en: "This sounds serious. If you are in danger, call 000 now. Contact the services below as soon as you can — calling them does NOT put your visa at risk.",
};

export function urgentBlock(nlu: NluResult, selfHarm: boolean, lang: AnswerLang) {
  if (selfHarm) {
    return {
      show: true,
      message: URGENT_SELF_HARM[lang],
      contacts: [C.lifeline, C.emergency, C.tis].map((s) => localise(s, lang)),
    };
  }
  if (nlu.risk === "high") {
    return {
      show: true,
      message: URGENT_HIGH_RISK[lang],
      contacts: [C.emergency, C.police, C.fwo, C.tis].map((s) => localise(s, lang)),
    };
  }
  return { show: false, message: "", contacts: [] as SupportContact[] };
}
