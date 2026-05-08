import type { NextConfig } from "next";
import path from "path";
import withPWAInit from "@ducanh2912/next-pwa";

// Get API URL from environment or use default
const getApiHost = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  try {
    const url = new URL(apiUrl);
    return {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
    };
  } catch {
    return {
      hostname: 'localhost',
      port: '8000',
      protocol: 'http' as const,
    };
  }
};

const apiConfig = getApiHost();

const nextConfig: NextConfig = {
  output: "standalone",
  // Silence Turbopack/webpack config conflict (Next.js 16 defaults to Turbopack)
  turbopack: {},
  // Ensure Next doesn't infer the workspace root from a different lockfile when deployed
  // alongside the Django project (which may have its own package-lock.json).
  outputFileTracingRoot: path.resolve(__dirname),


  images: {
    remotePatterns: [
      {
        protocol: apiConfig.protocol,
        hostname: apiConfig.hostname,
        ...(apiConfig.port && apiConfig.port !== '80' && apiConfig.port !== '443' && { port: apiConfig.port }),
        pathname: '/media/**',
      },
      // Also allow localhost for development
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8001',
        pathname: '/media/**',
      },
    ],
  },

  // Security headers — mitigate clickjacking, MIME sniffing, XSS
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    const baseUrl = apiUrl.replace(/\/api\/?$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
      {
        source: "/media/:path*",
        destination: `${baseUrl}/media/:path*`,
      },
    ];
  },
};




const withPWA = withPWAInit({
  dest: "public",
  customWorkerSrc: "worker",
  register: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    skipWaiting: true,
  },
});

export default withPWA(nextConfig);
