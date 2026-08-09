/** @type {import('next').NextConfig} */

// Security headers (pola SECURITY.md website utama) untuk dashboard dev.
// - CSP mengizinkan 'unsafe-inline' karena Next.js menyuntikkan skrip bootstrap
//   & ada skrip tema inline (app/layout.js); 'unsafe-eval' hanya di mode dev
//   (webpack/Turbopack HMR).
// - Origin website utama (SITE_BASE_URL) diizinkan di style-src/img-src agar
//   preview iframe (halaman /system) tetap memuat CSS & gambar dengan benar.
// - HSTS hanya dikirim di produksi.
const securityHeaders = (isProd) => {
  // Origin website utama (SITE_BASE_URL) diizinkan di style-src/img-src/
  // font-src agar preview iframe (/system) tetap memuat CSS & gambar.
  // Selalu sertakan origin produksi (Vercel) + localhost dev.
  // Single source of truth: pakai SITE_BASE_URL dari env; fallback domain
  // produksi. Origin localhost dev selalu disertakan untuk preview lokal.
  const siteOrigin = [
    'http://localhost:22889 https://localhost:22889 http://127.0.0.1:22889 https://127.0.0.1:22889',
    process.env.SITE_BASE_URL || 'https://gpieluzaikids.vercel.app',
  ].join(' ');
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
        `style-src 'self' 'unsafe-inline' ${siteOrigin}`,
        `img-src 'self' data: blob: ${siteOrigin}`,
        `font-src 'self' data: ${siteOrigin}`,
        `connect-src 'self'${isProd ? '' : ' ws: wss:'}`,
        "frame-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
    ...(isProd
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
      : []),
  ];
};

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
