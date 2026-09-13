/**
 * Fixed-window rate limiter, giữ trong RAM.
 *
 * Trên Cloudflare Workers, bộ nhớ này thuộc về từng isolate và mất khi isolate bị thu hồi,
 * nên đây chỉ là lớp chặn spam ngắn hạn để bảo vệ hạn mức Gemini — không phải cơ chế
 * chống lạm dụng nghiêm túc. Muốn chắc chắn thì chuyển sang Durable Object hoặc KV.
 */
interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count < limit) {
    bucket.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  return { allowed: false, retryAfterMs: windowMs - (now - bucket.windowStart) };
}
