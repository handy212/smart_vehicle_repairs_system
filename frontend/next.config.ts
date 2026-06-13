import type { NextConfig } from "next";
import path from "path";
import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

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
  // Keep trailing slashes on proxied /api/* POSTs (Django requires them; default redirect drops POST body).
  skipTrailingSlashRedirect: true,
  // Allow the dev server to accept 127.0.0.1 origin requests in addition to localhost.
  // This fixes blocked HMR/dev resource access when browsing via 127.0.0.1.
  allowedDevOrigins: ['127.0.0.1'],
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
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
        ],
      },
    ];
  },

  // /api and /media: proxy.ts + beforeFiles rewrites (matcher must include /media/* — image ext. excluded from catch-all)
  async rewrites() {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api").replace(
      /\/$/,
      ""
    );
    const backendOrigin = apiUrl.replace(/\/api\/?$/, "");
    return {
      beforeFiles: [
        { source: "/api", destination: apiUrl },
        { source: "/api/:path*", destination: `${apiUrl}/:path*` },
        { source: "/media/:path*", destination: `${backendOrigin}/media/:path*` },
      ],
    };
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /@prisma[\\/]instrumentation[\\/]node_modules[\\/]@opentelemetry[\\/]instrumentation/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

    return config;
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

const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

const finalConfig = sentryEnabled
  ? withSentryConfig(withPWA(nextConfig), {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      automaticVercelMonitors: false,
      telemetry: false,
    })
  : withPWA(nextConfig);

export default finalConfig;
