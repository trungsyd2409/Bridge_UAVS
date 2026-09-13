import type { Metadata } from "next";
import "./globals.css";
import "./beta.css";

export const metadata: Metadata = {
  title: "Bridge · Quyền lợi làm việc",
  description: "Hiểu quyền lợi, ghi lại công việc và tìm hỗ trợ bằng tiếng Việt.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
