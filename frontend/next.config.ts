import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Explicitly set the project root so Turbopack resolves paths
  // correctly when built inside a monorepo (e.g. Render cloning
  // the whole repo and building from the frontend/ subdirectory).
  turbopack: {
    root: path.resolve(__dirname),
    resolveAlias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
};

export default nextConfig;
