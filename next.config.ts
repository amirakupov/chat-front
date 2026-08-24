import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Dockerfile copies .next/standalone and runs its server.js. Without this the image would
  // need the whole node_modules to run `next start`; with it Next traces the files each route
  // actually loads and the runtime stage stays at a few dozen megabytes.
  output: "standalone",
};

export default nextConfig;
