// Đặt biến môi trường của wrangler TRƯỚC khi @cloudflare/vite-plugin được nạp:
// wrangler chốt đường ghi log ngay lúc import. Xem build/wrangler-env.ts.
import "./build/wrangler-env";
import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig, type Plugin, type PluginOption } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

// ---- Nơi deploy ----
// Mặc định: Cloudflare Workers (`pnpm dev`, `pnpm build`, `npx @vinext/cloudflare deploy`).
// Đặt VERCEL, NITRO_PRESET hoặc DEPLOY_TARGET=nitro thì chuyển sang Nitro để deploy
// Vercel/Netlify/AWS. Vercel tự đặt sẵn biến VERCEL trong lúc build.
const usesNitro = Boolean(
  process.env.VERCEL || process.env.NITRO_PRESET || process.env.DEPLOY_TARGET === "nitro",
);

// Ghi đè lên wrangler.jsonc cho phần phụ thuộc hosting.json của ChatGPT Sites.
const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

/**
 * Ngoài Cloudflare thì `cloudflare:workers` không tồn tại, và bundler sẽ dừng ngay ở
 * bước resolve. Thay nó bằng một module giả đọc process.env — đúng chỗ Vercel/Node
 * để biến môi trường. Chỉ dùng cho nhánh Nitro; bản Cloudflare vẫn dùng binding thật.
 */
function cloudflareWorkersShim(): Plugin {
  const VIRTUAL = "\0cloudflare-workers-shim";
  return {
    name: "cloudflare-workers-shim",
    enforce: "pre",
    resolveId(id) {
      return id === "cloudflare:workers" ? VIRTUAL : null;
    },
    load(id) {
      if (id !== VIRTUAL) return null;
      return [
        "const env = typeof process !== 'undefined' && process.env ? process.env : {};",
        "export { env };",
        "export default { env };",
      ].join("\n");
    },
  };
}

export default defineConfig(async () => {
  const plugins: PluginOption[] = [vinext(), sites({ mockAuth: !managedLinux })];

  if (usesNitro) {
    // @ts-ignore -- `nitro` chỉ cần khi build cho Vercel/Netlify/AWS, không cài sẵn cho bản Cloudflare.
    const nitro = await import("nitro/vite").then((m) => m.nitro).catch(() => null);
    if (!nitro) {
      throw new Error("Build cho Vercel/Nitro cần package `nitro`. Chạy: pnpm add -D nitro");
    }
    plugins.push(cloudflareWorkersShim(), nitro());
  } else {
    plugins.push(
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    );
  }

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins,
  };
});
