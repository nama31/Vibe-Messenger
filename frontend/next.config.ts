import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output is only needed for Docker deployments.
  // Render's native Node runtime uses `next start` directly.
  // output: "standalone",
};

export default nextConfig;
