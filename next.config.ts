import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Part photos will be hosted on Cloudinary only. No other remote hosts (no hotlinking).
  images: { remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }] },
  async redirects() {
    return [
      { source: "/products", destination: "/parts", statusCode: 301 },
      { source: "/products/:path*", destination: "/parts", statusCode: 301 },
    ];
  },
};

export default nextConfig;
