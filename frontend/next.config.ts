import type { NextConfig } from "next";
import path from "path";

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
        port: '8000',
        pathname: '/media/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api"}/:path*`,
      },
    ];
  },
};




const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

export default withPWA(nextConfig);

