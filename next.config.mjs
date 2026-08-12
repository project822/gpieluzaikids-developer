/** @type {import('next').NextConfig} */

// Security headers (pola SECURITY.md website utama) untuk dashboard dev.
// Catatan: Content-Security-Policy kini ditetapkan DINAMIS per-request di
// proxy.js (nonce CSP unik tiap request) — tidak bisa statis di sini.
// - HSTS hanya dikirim di produksi.
const securityHeaders = (isProd) => [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig = {
  // Jangan ekspos versi framework.
  poweredByHeader: false,

  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    return [
      {
        source: '/:path*',
        headers: securityHeaders(isProd),
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
