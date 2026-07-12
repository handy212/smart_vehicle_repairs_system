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
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dispose idle route bundles in dev to reduce memory pressure and dev-server crashes.
  onDemandEntries: isDev
    ? {
        // Keep more routes warm — default eviction forces slow recompiles on navigation.
        maxInactiveAge: 15 * 60 * 1000,
        pagesBufferLength: 20,
      }
    : undefined,
  experimental: {
    // Extra barrel-import packages beyond Next.js defaults (lucide-react, date-fns, recharts).
    optimizePackageImports: [
      "recharts",
      "framer-motion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tooltip",
      "@fullcalendar/react",
      "@fullcalendar/daygrid",
      "@fullcalendar/timegrid",
      "@fullcalendar/interaction",
    ],
  },
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

  // BFF routes under app/api/* must win over Django proxying. Media has no local handlers.
  async rewrites() {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api").replace(
      /\/$/,
      ""
    );
    const backendOrigin = apiUrl.replace(/\/api\/?$/, "");
    return {
      beforeFiles: [
        { source: "/media/:path*", destination: `${backendOrigin}/media/:path*` },
      ],
      afterFiles: [
        { source: "/api", destination: apiUrl },
        { source: "/api/:path*", destination: `${apiUrl}/:path*` },
      ],
    };
  },
  webpack: (config, { dev }) => {
    if (dev) {
      const existingIgnored = config.watchOptions?.ignored;
      const ignoredList = [
        ...(Array.isArray(existingIgnored)
          ? existingIgnored
          : existingIgnored
            ? [existingIgnored]
            : []),
        "**/htmlcov/**",
        "**/.pytest_cache/**",
        "**/coverage.xml",
        "**/coverage/**",
      ].filter(
        (pattern): pattern is string =>
          typeof pattern === 'string' && pattern.trim().length > 0,
      );
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ignoredList,
      };
    }

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
  // Keep default Workbox rules; only override hashed Next assets (see runtimeCaching).
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    // Hashed Next.js build assets must not be precached — stale SW entries after
    // deploy cause NS_ERROR_CORRUPTED_CONTENT and cascading React hook errors.
    exclude: [
      /\/_next\/static\/chunks\//,
      /\/_next\/static\/css\//,
      /\.map$/,
    ],
    runtimeCaching: [
      {
        urlPattern: /\/_next\/static\/.+/i,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /\/_next\/data\/.+/i,
        handler: "NetworkOnly",
      },
    ],
  },
});

const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

/** PWA wrapping adds compile overhead; only apply for production builds. */
const withPWAInProduction = (config: NextConfig) =>
  isDev ? config : withPWA(config);

const finalConfig = sentryEnabled
  ? withSentryConfig(withPWAInProduction(nextConfig), {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      // widenClientFileUpload is memory-heavy on large apps; opt in via env if needed.
      widenClientFileUpload: process.env.SENTRY_WIDEN_CLIENT_UPLOAD === "1",
      disableLogger: true,
      automaticVercelMonitors: false,
      telemetry: false,
    })
  : withPWAInProduction(nextConfig);

export default finalConfig;
