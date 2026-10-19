import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.RESUMEFORGE_DIST_DIR || '.next',
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@resumeforge/contracts', '@resumeforge/resume'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default config;
