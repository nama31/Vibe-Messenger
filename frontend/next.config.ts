import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker standalone output — generates server.js
  output: "standalone",
};

export default nextConfig;
