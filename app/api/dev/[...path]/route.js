// Proxy generik: meneruskan /api/dev/* dari dashboard ke website utama
// (D:\church) dengan header X-Dev-Key. Berjalan di server — kunci tidak
// pernah terlihat browser.
//
// Selalu mengembalikan JSON — bila website utama merespons non-JSON (mis.
// halaman error HTML) atau terjadi error lain, client tetap mendapat JSON
// dengan pesan yang jelas (bukan halaman HTML 500).

import { siteFetch, SITE_BASE_URL } from '@/lib/siteApi';

async function forward(request, params, method) {
  const { path } = await params;
  const pathname = `/api/dev/${path.join('/')}`;

  let body;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }

  const qs = request.nextUrl.search;
  const result = await siteFetch(pathname + qs, { method, body });

  if (result.status === 0) {
    return Response.json(
      {
        error: `Website utama tidak dapat dijangkau (${SITE_BASE_URL}). Periksa koneksi atau status SITE_BASE_URL di .env.local.`,
        siteOnline: false,
      },
      { status: 502 }
    );
  }
  if (result.data === null) {
    return Response.json(
      { error: `Website utama mengembalikan respons tidak valid (HTTP ${result.status}).`, siteOnline: result.ok },
      { status: 502 }
    );
  }
  return Response.json(result.data, { status: result.status });
}

async function handle(request, params, method) {
  try {
    return await forward(request, params, method);
  } catch (error) {
    console.error('[api/dev proxy]', error);
    return Response.json({ error: 'Gagal meneruskan permintaan ke website utama.' }, { status: 500 });
  }
}

export function GET(request, { params }) {
  return handle(request, params, 'GET');
}
export function POST(request, { params }) {
  return handle(request, params, 'POST');
}
export function PATCH(request, { params }) {
  return handle(request, params, 'PATCH');
}
export function PUT(request, { params }) {
  return handle(request, params, 'PUT');
}
export function DELETE(request, { params }) {
  return handle(request, params, 'DELETE');
}
