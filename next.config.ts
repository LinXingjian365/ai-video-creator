import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: false
  },
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
    "fluent-ffmpeg"
  ]
};

export default nextConfig;
