import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.ctfassets.net",
      },
      {
        protocol: "https",
        hostname: "static.ah.nl",
      },
      {
        protocol: "https",
        hostname: "assets.jumbo.com",
      },
    ],
  },
};

export default nextConfig;
