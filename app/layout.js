import localFont from 'next/font/local';
import 'bootstrap/dist/css/bootstrap.min.css';
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
  title: 'Eluzai Dev Console',
  description: 'Dashboard developer GPI Eluzai — kontrol & pemantauan website utama.',
};

// Terapkan tema sebelum render (anti flash) — skrip ini menyalin perilaku
// ThemeToggle di website utama.
const themeScript = `(function(){try{var t=localStorage.getItem('eluzai-dev-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${inter.variable} ${hanken.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
