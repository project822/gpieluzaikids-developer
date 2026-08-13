import localFont from 'next/font/local';
import { headers } from 'next/headers';
// Bootstrap parsial — hanya bagian yang DIPAKAI dashboard (grid + utilities +
// reboot). Komponen lain (btn/form/modal/nav/card/dll.) sudah punya versi
// custom dev-* di globals.css; `.spinner-border` & `.table-responsive` juga
// dipindah ke globals.css. Hemat ±85KB CSS (full bootstrap.min.css 232KB).
import 'bootstrap/dist/css/bootstrap-reboot.min.css';
import 'bootstrap/dist/css/bootstrap-grid.min.css';
import 'bootstrap/dist/css/bootstrap-utilities.min.css';
import './globals.css';

// Font lokal dari folder fonts/ (tanpa request ke Google Fonts):
//   - Inter → teks UI/body (400–700)
//   - Hanken Grotesk → judul, angka, brand (600–800)
const inter = localFont({
  src: [
    { path: '../fonts/inter-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/inter-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/inter-600.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/inter-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
});

const hanken = localFont({
  src: [
    { path: '../fonts/hanken-grotesk-600.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/hanken-grotesk-700.woff2', weight: '700', style: 'normal' },
    { path: '../fonts/hanken-grotesk-800.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-hanken',
  display: 'swap',
});

export const metadata = {
  title: 'Eluzai Kids Developer',
  description: 'Dashboard developer GPI Eluzai — kontrol & pemantauan website utama.',
};

// Terapkan tema sebelum render (anti flash) — default LIGHT; dark hanya bila
// user memilihnya secara eksplisit (localStorage 'eluzai-dev-theme' = 'dark').
const themeScript = `(function(){try{var t=localStorage.getItem('eluzai-dev-theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default async function RootLayout({ children }) {
  // Nonce CSP berasal dari proxy.js (header request `x-nonce`). Wajib dipakai
  // script tema inline — script-src sudah TIDAK berisi 'unsafe-inline'.
  // Catatan: headers() membuat seluruh halaman dirender dinamis per-request.
  const nonce = (await headers()).get('x-nonce');
  return (
    <html lang="id" className={`${inter.variable} ${hanken.variable}`} suppressHydrationWarning>
      <head>
        {/* Nonce wajib ada (dari proxy.js) — tanpa nonce script ter-block CSP;
            lebih baik tidak dirender daripada memicu error konsol. */}
        {nonce && <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />}
      </head>
      <body>{children}</body>
    </html>
  );
}
