import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  // Disable body size limit for API routes (large audio file upload)
  serverExternalPackages: ['@distube/ytdl-core'],
};

export default nextConfig;
