import { withSentryConfig } from '@sentry/nextjs/config'

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@reci/ui', '@reci/utils', '@reci/types'],
  serverExternalPackages: ['stripe'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Content-Security-Policy is set per-request in middleware.ts with a
          // per-request nonce — a static one here can't carry a nonce and would
          // conflict with it.
        ],
      },
    ]
  },
  async rewrites() {
    const adminUrl = process.env.ADMIN_URL || 'http://localhost:3001'
    return [
      {
        source: '/admin/:path*',
        destination: `${adminUrl}/admin/:path*`,
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
})
