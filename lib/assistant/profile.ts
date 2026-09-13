/** Lọc hồ sơ người dùng gửi lên: chỉ giữ giá trị khớp taxonomy của kho tài liệu. */
import type { UserProfile } from "./types";

const ALLOWED = {
  visa: ["student", "whv", "temp_work", "pr"],
  industry: ["hospitality", "beauty", "cleaning", "retail", "farm"],
  employment: ["casual", "part_time", "full_time", "contractor"],
  state: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
} as const;

/** Chỉ giữ giá trị hợp lệ: dữ liệu từ trình duyệt không được tin tuyệt đối. */
export function sanitizeProfile(raw: unknown): UserProfile {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const pick = <K extends keyof typeof ALLOWED>(key: K) => {
    const v = typeof r[key] === "string" ? (r[key] as string) : undefined;
    return v && (ALLOWED[key] as readonly string[]).includes(v) ? v : undefined;
  };
  return {
    visa: pick("visa") as UserProfile["visa"],
    industry: pick("industry") as UserProfile["industry"],
    employment: pick("employment") as UserProfile["employment"],
    state: pick("state"),
  };
}

// ---- Nhận cả nhãn onboarding của BRIDGE, không chỉ mã taxonomy ----
// Hồ sơ trong app lưu NHÃN người dùng nhìn thấy ("Casual", "Nhà hàng & quán cà phê",
// "485 · Temporary Graduate"). So khớp bằng từ khoá, không phân biệt hoa thường;
// nhãn "Khác"/"Chưa rõ" cố ý không khớp gì -> không lọc, kết quả rộng hơn.

const VISA_RULES: [RegExp, NonNullable<UserProfile["visa"]>][] = [
  [/student|du học|\b500\b/i, "student"],
  [/working holiday|whv|\b417\b|\b462\b/i, "whv"],
  [/temporary work|temp_work|lao động|\b482\b|\b407\b|\b485\b|\b489\b|\b491\b|\b494\b/i, "temp_work"],
  [/permanent|thường trú|\bpr\b|\b186\b|\b187\b|\b189\b|\b190\b/i, "pr"],
];
const INDUSTRY_RULES: [RegExp, NonNullable<UserProfile["industry"]>][] = [
  [/nhà hàng|cà phê|quán|hospitality|restaurant|caf|fast ?food|đồ ăn nhanh/i, "hospitality"],
  [/nail|làm đẹp|beauty|tóc|hair/i, "beauty"],
  [/dọn dẹp|vệ sinh|cleaning/i, "cleaning"],
  [/bán lẻ|retail/i, "retail"],
  [/nông trại|nông nghiệp|farm|agriculture/i, "farm"],
];
const EMPLOYMENT_RULES: [RegExp, NonNullable<UserProfile["employment"]>][] = [
  [/casual|thời vụ/i, "casual"],
  [/part[-_ ]?time|bán thời gian/i, "part_time"],
  [/full[-_ ]?time|toàn thời gian/i, "full_time"],
  [/contractor|abn/i, "contractor"],
];

function match<T>(value: unknown, rules: [RegExp, T][]): T | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return rules.find(([re]) => re.test(value))?.[1];
}

/** Hồ sơ onboarding của BRIDGE (nhãn tiếng Việt/Anh) -> mã taxonomy. */
export function profileFromOnboarding(row: Record<string, unknown> | undefined | null): UserProfile {
  if (!row) return {};
  // residency của BRIDGE: 'pr' | 'citizen' | 'visa' | 'unsure'
  const residency = typeof row.residency === "string" ? row.residency : "";
  const visaFromResidency = residency === "pr" ? ("pr" as const) : undefined;
  return {
    visa: match(row.visa, VISA_RULES) ?? visaFromResidency,
    industry: match(row.industry, INDUSTRY_RULES),
    employment: match(row.employment, EMPLOYMENT_RULES),
  };
}

/** Gộp hai cách đọc: ưu tiên mã taxonomy, thiếu thì suy từ nhãn onboarding. */
export function readProfile(raw: unknown): UserProfile {
  if (!raw || typeof raw !== "object") return {};
  const byCode = sanitizeProfile(raw);
  const byLabel = profileFromOnboarding(raw as Record<string, unknown>);
  return {
    visa: byCode.visa ?? byLabel.visa,
    industry: byCode.industry ?? byLabel.industry,
    employment: byCode.employment ?? byLabel.employment,
    state: byCode.state,
  };
}
