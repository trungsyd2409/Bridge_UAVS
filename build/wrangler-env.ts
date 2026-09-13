/**
 * Biến môi trường của Wrangler/Miniflare, đặt trong một module riêng.
 *
 * Vì sao tách ra: wrangler chốt đường ghi log NGAY LÚC được import, mà
 * `@cloudflare/vite-plugin` kéo wrangler theo. ESM chạy các module đúng thứ tự
 * import, nên đặt `import "./build/wrangler-env"` TRƯỚC dòng import plugin trong
 * vite.config.ts là đủ để các biến này có mặt kịp.
 *
 * Trước đây vite.config.ts đạt được điều đó bằng `await import(...)` động, nhưng
 * `@vinext/cloudflare deploy` quét vite.config bằng regex và chỉ nhận ra import
 * TĨNH — dùng import động thì nó báo "Missing @cloudflare/vite-plugin".
 *
 * Đây là thiết lập của công cụ, không phải cấu hình ứng dụng: biến của app nằm
 * trong `.dev.vars` (không commit).
 */

// Dùng Request.cf giả của Miniflare, trừ khi thật sự cần fetch dữ liệu đó.
process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
process.env.WRANGLER_SEND_METRICS ??= "false";

// Giữ state của Wrangler và Miniflare nằm trong thư mục dự án.
process.env.WRANGLER_WRITE_LOGS ??= "false";
process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

export {};
