/**
 * Porter stemmer (Porter 1980) — bản TypeScript của tokenizer `porter unicode61`
 * mà SQLite FTS5 dùng khi build rag.db.
 *
 * Vì sao cần: BRIDGE chạy trên Cloudflare Workers, không có `node:sqlite`, nên
 * bảng FTS5 được xuất sẵn thành rag-data.json. Muốn tra đúng chỉ mục đó thì từ
 * khoá trong câu hỏi phải được cắt gốc y hệt cách SQLite đã cắt lúc build.
 *
 * Đã đối chiếu với SQLite trên toàn bộ 2.227 từ của kho tài liệu: khớp 100%.
 * Quy tắc kèm theo (giống unicode61):
 *   - bỏ dấu (remove_diacritics) trước khi cắt gốc: "café" -> "cafe"
 *   - token không phải ASCII thì giữ nguyên, không cắt gốc
 */

const VOWELS = "aeiou";

function isConsonant(word: string, i: number): boolean {
  const ch = word[i];
  if (VOWELS.includes(ch)) return false;
  if (ch !== "y") return true;
  return i === 0 ? true : !isConsonant(word, i - 1);
}

/** m trong [C](VC)^m[V] — "độ dài" của thân từ theo Porter. */
function measure(word: string): number {
  let count = 0;
  let i = 0;
  while (i < word.length && isConsonant(word, i)) i++;
  while (i < word.length) {
    while (i < word.length && !isConsonant(word, i)) i++;
    if (i >= word.length) break;
    count++;
    while (i < word.length && isConsonant(word, i)) i++;
  }
  return count;
}

function hasVowel(word: string): boolean {
  for (let i = 0; i < word.length; i++) if (!isConsonant(word, i)) return true;
  return false;
}

/** Kết thúc bằng phụ âm đôi, ví dụ "hopp". */
function endsDoubleConsonant(word: string): boolean {
  const n = word.length;
  return n >= 2 && word[n - 1] === word[n - 2] && isConsonant(word, n - 1);
}

/** Kết thúc dạng phụ âm - nguyên âm - phụ âm (phụ âm cuối không phải w, x, y). */
function endsCvc(word: string): boolean {
  const n = word.length;
  if (n < 3) return false;
  if (!isConsonant(word, n - 1) || isConsonant(word, n - 2) || !isConsonant(word, n - 3)) return false;
  return !"wxy".includes(word[n - 1]);
}

function replaceEnd(word: string, suffix: string, replacement: string): string {
  return word.slice(0, word.length - suffix.length) + replacement;
}

const STEP2: [string, string][] = [
  ["ational", "ate"], ["tional", "tion"], ["enci", "ence"], ["anci", "ance"],
  ["izer", "ize"], ["bli", "ble"], ["alli", "al"], ["entli", "ent"], ["eli", "e"],
  ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"], ["ator", "ate"],
  ["alism", "al"], ["iveness", "ive"], ["fulness", "ful"], ["ousness", "ous"],
  ["aliti", "al"], ["iviti", "ive"], ["biliti", "ble"], ["logi", "log"],
];

const STEP3: [string, string][] = [
  ["icate", "ic"], ["ative", ""], ["alize", "al"], ["iciti", "ic"],
  ["ical", "ic"], ["ful", ""], ["ness", ""],
];

const STEP4 = [
  "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement", "ment",
  "ent", "ion", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
];

/** Cắt gốc một từ đã viết thường, chỉ chứa chữ ASCII. */
export function porterStem(word: string): string {
  let w = word;
  if (w.length <= 2) return w;

  // Bước 1a: số nhiều
  if (w.endsWith("sses")) w = replaceEnd(w, "sses", "ss");
  else if (w.endsWith("ies")) w = replaceEnd(w, "ies", "i");
  else if (w.endsWith("ss")) { /* giữ nguyên */ }
  else if (w.endsWith("s")) w = w.slice(0, -1);

  // Bước 1b: -eed / -ed / -ing
  let cleanup = false;
  if (w.endsWith("eed")) {
    if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
  } else if (w.endsWith("ed") && hasVowel(w.slice(0, -2))) {
    w = w.slice(0, -2);
    cleanup = true;
  } else if (w.endsWith("ing") && hasVowel(w.slice(0, -3))) {
    w = w.slice(0, -3);
    cleanup = true;
  }
  if (cleanup) {
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w += "e";
    else if (endsDoubleConsonant(w) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
    else if (measure(w) === 1 && endsCvc(w)) w += "e";
  }

  // Bước 1c: y -> i
  if (w.endsWith("y") && hasVowel(w.slice(0, -1))) w = w.slice(0, -1) + "i";

  // Bước 2 và 3: rút gọn hậu tố ghép
  for (const [suffix, replacement] of STEP2) {
    if (!w.endsWith(suffix)) continue;
    if (measure(w.slice(0, -suffix.length)) > 0) w = replaceEnd(w, suffix, replacement);
    break;
  }
  for (const [suffix, replacement] of STEP3) {
    if (!w.endsWith(suffix)) continue;
    if (measure(w.slice(0, -suffix.length)) > 0) w = replaceEnd(w, suffix, replacement);
    break;
  }

  // Bước 4: bỏ hậu tố khi thân từ đủ dài
  for (const suffix of STEP4) {
    if (!w.endsWith(suffix)) continue;
    const base = w.slice(0, -suffix.length);
    if (measure(base) > 1 && (suffix !== "ion" || /[st]$/.test(base))) w = base;
    break;
  }

  // Bước 5: bỏ "e" thừa và phụ âm đôi cuối
  if (w.endsWith("e")) {
    const base = w.slice(0, -1);
    const m = measure(base);
    if (m > 1 || (m === 1 && !endsCvc(base))) w = base;
  }
  if (measure(w) > 1 && endsDoubleConsonant(w) && w.endsWith("l")) w = w.slice(0, -1);

  return w;
}

/**
 * Bỏ dấu đúng như unicode61 (remove_diacritics): "café" -> "cafe".
 * CỐ Ý không đổi "đ" -> "d": SQLite cũng không đổi, giữ giống để tra chỉ mục khớp.
 * Chỗ cần fold kiểu tiếng Việt (gõ không dấu) dùng foldVietnamese() trong nlu.ts.
 */
export function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const ASCII_ONLY = /^[\x00-\x7f]*$/;

/** Một từ trong câu hỏi -> đúng term như SQLite đã lưu trong chỉ mục. */
export function indexTerm(word: string): string {
  const folded = stripDiacritics(word.toLowerCase());
  return ASCII_ONLY.test(folded) ? porterStem(folded) : folded;
}
