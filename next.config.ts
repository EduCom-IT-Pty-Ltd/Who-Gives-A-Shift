import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Route handlers touch the DB and Graph; never cache them.
  typedRoutes: true,
};

export default nextConfig;
