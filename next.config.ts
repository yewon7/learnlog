import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    resolveAlias: {
      canvas: { browser: './empty-module.js' },
    },
  },
  // Docker 등 자체 호스팅 시 필요하면 주석 해제
  // output: 'standalone',
};

export default nextConfig;
