import type { NextConfig } from "next";

const frameAncestors =
  process.env.FRAME_ANCESTORS ??
  "'self' https://*.feishu.cn https://*.larksuite.com https://*.larkoffice.com";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd()
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors};`
          }
        ]
      }
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" }
    ]
  }
};

export default nextConfig;
