/**
 * Tìm kiếm trong kho tài liệu Fair Work — bản chạy được trên Cloudflare Workers.
 *
 * Bản gốc (bridge_demo_1) mở file data/rag.db bằng `node:sqlite`. Worker không có
 * module đó, nên toàn bộ rag.db đã được xuất sẵn ra `rag-data.json`:
 *   - chunks     : 239 đoạn văn + metadata để lọc theo hồ sơ
 *   - embeddings : 239 x 768 số float32, gói base64 (vector đã chuẩn hoá L2)
 *   - bm25       : chỉ mục nghịch đảo lấy TRỰC TIẾP từ tokenizer FTS5 của SQLite
 *                  (term đã cắt gốc bằng porter), kèm độ dài mỗi tài liệu
 *
 * Công thức BM25 dưới đây là bản chép lại của hàm bm25() trong SQLite FTS5
 * (k1 = 1.2, b = 0.75, trọng số cột: tiêu đề 2.0, nội dung 1.0). Đã đối chiếu
 * với SQLite trên 11 truy vấn mẫu: thứ hạng trùng khớp, sai số điểm < 1e-14.
 *
 *   englishQuery ──► vectorSearch (cosine) ──┐
 *               └──► keywordSearch (BM25)  ──┴─► rrf() ──► ứng viên cho rerank
 */
import { EMBED_DIM, RRF_K } from "./config";
import { indexTerm } from "./porter";
import ragData from "./rag-data.json";
import type { SearchHit } from "./types";

export interface Filters {
  topics?: string[];
  languages?: string[];
  industry?: string; // một giá trị từ hồ sơ; chunk khớp nếu chứa giá trị này hoặc "all"
  visa?: string;
  employment?: string;
}

interface Row {
  id: number;
  chunkId: string;
  docId: string;
  contextHeader: string;
  content: string;
  url: string;
  source: string;
  language: string;
  topic: string;
  subtopic: string;
  industry: string[];
  visa: string[];
  employment: string[];
}

// ---------- Hàm thuần (không đụng dữ liệu) ----------

/** Reciprocal Rank Fusion: điểm = tổng 1 / (k + hạng), hạng bắt đầu từ 1. */
export function rrf<T>(rankedLists: T[][], k = RRF_K): [T, number][] {
  const scores = new Map<T, number>();
  for (const list of rankedLists) {
    list.forEach((item, i) => scores.set(item, (scores.get(item) ?? 0) + 1 / (k + i + 1)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]);
}

const WORD = /[a-zA-ZÀ-ỹ0-9]+/g;
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "am", "was", "were", "be", "been", "do", "does", "did",
  "i", "me", "my", "you", "your", "he", "she", "it", "we", "they", "them", "their",
  "to", "of", "in", "on", "at", "for", "with", "and", "or", "but", "if", "so", "not",
  "can", "could", "should", "would", "will", "what", "when", "where", "who", "how", "why",
  "this", "that", "these", "those", "there", "have", "has", "had", "about", "from", "by",
]);

/**
 * Câu hỏi -> danh sách term đã cắt gốc, bỏ trùng.
 * Thay cho buildFtsQuery() cũ (sinh chuỗi `"word" OR "word"` cho FTS5):
 * ở đây tra chỉ mục trực tiếp nên chỉ cần danh sách term.
 */
export function queryTerms(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const word of text.toLowerCase().match(WORD) ?? []) {
    if (word.length < 2 || STOPWORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    terms.push(indexTerm(word));
  }
  return terms;
}

// ---------- Giải nén dữ liệu đã xuất ----------

function decodeBase64(base64: string): Uint8Array {
  // atob có sẵn cả trên Workers lẫn Node 18+.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// BM25 giống SQLite FTS5.
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const HEADER_WEIGHT = 2.0;
const CONTENT_WEIGHT = 1.0;

// ---------- Chỉ mục ----------

export class RagIndex {
  readonly meta: Record<string, string>;
  readonly rows: Row[];
  private readonly matrix: Float32Array; // rows.length x 768, liền một khối
  private readonly posOfId = new Map<number, number>();
  private readonly postings = new Map<string, number[]>(); // term -> [docIdx, fHeader, fContent, ...]
  private readonly docLen: number[];
  private readonly avgdl: number;

  constructor() {
    this.meta = ragData.meta as Record<string, string>;
    if (ragData.embedDim !== EMBED_DIM) {
      throw new Error(`rag-data.json có vector ${ragData.embedDim} chiều, app cần ${EMBED_DIM}`);
    }

    const bytes = decodeBase64(ragData.embeddings);
    this.matrix = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);

    this.rows = ragData.chunks as Row[];
    this.rows.forEach((row, i) => this.posOfId.set(row.id, i));
    if (this.matrix.length !== this.rows.length * EMBED_DIM) {
      throw new Error("rag-data.json: số vector không khớp số đoạn văn");
    }

    const { terms, postings, docLen, avgdl } = ragData.bm25;
    terms.forEach((term: string, i: number) => this.postings.set(term, postings[i]));
    this.docLen = docLen;
    this.avgdl = avgdl;
  }

  get chunkCount(): number {
    return this.rows.length;
  }

  private matches(row: Row, filters?: Filters): boolean {
    if (!filters) return true;
    if (filters.topics?.length && !filters.topics.includes(row.topic)) return false;
    if (filters.languages?.length && !filters.languages.includes(row.language)) return false;
    for (const key of ["industry", "visa", "employment"] as const) {
      const wanted = filters[key];
      if (wanted && !row[key].includes("all") && !row[key].includes(wanted)) return false;
    }
    return true;
  }

  /** [id, cosine] giảm dần. Vector đã chuẩn hoá nên cosine = tích vô hướng. */
  vectorSearch(query: Float32Array, k: number, filters?: Filters): [number, number][] {
    if (query.length !== EMBED_DIM) {
      throw new Error(`vector câu hỏi ${query.length} chiều, cần ${EMBED_DIM}`);
    }
    const scored: [number, number][] = [];
    this.rows.forEach((row, i) => {
      if (!this.matches(row, filters)) return;
      let dot = 0;
      const offset = i * EMBED_DIM;
      for (let d = 0; d < EMBED_DIM; d++) dot += this.matrix[offset + d] * query[d];
      scored.push([row.id, dot]);
    });
    return scored.sort((a, b) => b[1] - a[1]).slice(0, k);
  }

  /**
   * [id] theo BM25, giống hệt `ORDER BY bm25(rag_fts, 2.0, 1.0)` của SQLite.
   * SQLite trả điểm ÂM (càng âm càng liên quan); ở đây giữ điểm dương và sắp giảm dần.
   */
  keywordSearch(queryText: string, k: number, filters?: Filters): number[] {
    const terms = queryTerms(queryText);
    if (!terms.length) return [];
    const total = this.docLen.length;
    const scores = new Map<number, number>();

    for (const term of terms) {
      const postings = this.postings.get(term);
      if (!postings) continue;
      const hits = postings.length / 3;
      let idf = Math.log((total - hits + 0.5) / (hits + 0.5));
      if (idf <= 0) idf = 1e-6; // giống nhánh idf<=0 trong fts5_aux.c
      for (let i = 0; i < postings.length; i += 3) {
        const doc = postings[i];
        const freq = HEADER_WEIGHT * postings[i + 1] + CONTENT_WEIGHT * postings[i + 2];
        const norm = 1 - BM25_B + (BM25_B * this.docLen[doc]) / this.avgdl;
        const score = idf * ((freq * (BM25_K1 + 1)) / (freq + BM25_K1 * norm));
        scores.set(doc, (scores.get(doc) ?? 0) + score);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, k * 5)
      .map(([doc]) => this.rows[doc].id)
      .filter((id) => this.matches(this.rows[this.posOfId.get(id) as number], filters))
      .slice(0, k);
  }

  /**
   * Hybrid = RRF của hai nhánh.
   * boostTopic: thêm nhánh thứ ba chỉ gồm chunk thuộc topic của NLU. Đây là lọc "mềm":
   * NLU đoán sai topic thì chunk đúng vẫn có cơ hội từ hai nhánh chính.
   */
  hybridSearch(
    queryVec: Float32Array,
    queryText: string,
    k: number,
    filters?: Filters,
    candidates = 20,
    boostTopic?: string,
  ): SearchHit[] {
    const vec = this.vectorSearch(queryVec, candidates, filters);
    const kw = this.keywordSearch(queryText, candidates, filters);
    const lists = [vec.map(([id]) => id), kw];
    if (boostTopic) {
      const topicOnly = this.vectorSearch(queryVec, candidates, { ...filters, topics: [boostTopic] });
      lists.push(topicOnly.map(([id]) => id));
    }
    const vecScore = new Map(vec);
    const vecRank = new Map(vec.map(([id], i) => [id, i + 1]));
    const kwRank = new Map(kw.map((id, i) => [id, i + 1]));

    return rrf(lists)
      .slice(0, k)
      .map(([id, score]) => {
        const row = this.rows[this.posOfId.get(id) as number];
        return {
          id,
          chunkId: row.chunkId,
          docId: row.docId,
          contextHeader: row.contextHeader,
          content: row.content,
          url: row.url,
          source: row.source,
          topic: row.topic,
          subtopic: row.subtopic,
          vectorScore: vecScore.get(id),
          vectorRank: vecRank.get(id),
          keywordRank: kwRank.get(id),
          rrfScore: score,
        };
      });
  }

  /** Chỉ BM25, dùng khi không embed được câu hỏi (mạng lỗi, timeout, thiếu key). */
  keywordOnlySearch(queryText: string, k: number, filters?: Filters): SearchHit[] {
    return this.keywordSearch(queryText, k, filters).map((id, i) => {
      const row = this.rows[this.posOfId.get(id) as number];
      return {
        id,
        chunkId: row.chunkId,
        docId: row.docId,
        contextHeader: row.contextHeader,
        content: row.content,
        url: row.url,
        source: row.source,
        topic: row.topic,
        subtopic: row.subtopic,
        keywordRank: i + 1,
        rrfScore: 1 / (RRF_K + i + 1),
      };
    });
  }
}

// ---------- Dựng một lần, dùng lại cho mọi request của cùng một isolate ----------

const globalCache = globalThis as unknown as { __bridgeRagIndex?: RagIndex };

export function getRagIndex(): RagIndex {
  if (!globalCache.__bridgeRagIndex) globalCache.__bridgeRagIndex = new RagIndex();
  return globalCache.__bridgeRagIndex;
}
