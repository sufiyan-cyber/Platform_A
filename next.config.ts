import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The generated Prisma client must not be bundled into the server runtime.
  serverExternalPackages: ["@prisma/client"],

  // Defence in depth: the Lyzr key only ever exists in route handlers, but these
  // headers keep the rest of the surface tight too.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Never let a proxy or browser cache an authenticated API response.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
