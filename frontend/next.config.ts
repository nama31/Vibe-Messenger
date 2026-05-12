/** @type {import('next').NextConfig} */
const nextConfig = {
  // THIS IS THE MAGIC LINE FOR DOCKER:
  output: "standalone",
  
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig; 
// (If using .mjs or .js, use: export default nextConfig;)