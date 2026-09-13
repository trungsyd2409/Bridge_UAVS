/**
 * Đọc biến môi trường trên Cloudflare Workers.
 *
 * BRIDGE chạy bằng vinext + Cloudflare Workers, KHÔNG phải Node server, nên
 * `process.env` không phải nguồn chính. Biến thật nằm trong binding của Worker
 * và được `cloudflare:workers` cung cấp:
 *   - local dev  : file `.dev.vars` ở gốc dự án (xem .dev.vars.example)
 *   - production : Settings -> Variables and Secrets của Worker
 *
 * Vẫn thử `process.env` sau cùng để chạy được cả khi build bằng Node thuần.
 * File này chỉ dùng phía server (route handler) — đừng import vào client component.
 */
import { env as cloudflareEnv } from "cloudflare:workers";

function pick(bag: unknown, name: string): string | undefined {
  if (!bag || typeof bag !== "object") return undefined;
  const value = (bag as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readEnv(name: string): string | undefined {
  let fromWorker: string | undefined;
  try {
    fromWorker = pick(cloudflareEnv, name);
  } catch {
    // Truy cập env ngoài phạm vi request có thể ném lỗi: bỏ qua, thử process.env.
    fromWorker = undefined;
  }
  if (fromWorker) return fromWorker;
  return typeof process !== "undefined" ? pick(process.env, name) : undefined;
}

/** Cờ bật/tắt: coi "1", "true", "yes" là bật. */
export function readFlag(name: string): boolean {
  const value = readEnv(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
