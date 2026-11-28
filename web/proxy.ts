import { NextResponse, type NextRequest } from 'next/server';

// Public builds expose only the checked catalog projection. Local review
// routes and source snapshots stay available in development.
export function proxy(request: NextRequest) {
  const rawPath = request.nextUrl.pathname;
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  if (path.includes('..') || /%2f|%5c/i.test(rawPath)) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (process.env.NODE_ENV === 'production') {
    const publicFile = path === '/data/release-current.json' || path === '/data/preferred_pns.json'
      || /^\/data\/published-releases\/[0-9a-f]{64}\/(?:vendor_index\.json|vendors\/[a-z0-9-]+\.json)$/.test(path);
    if (!publicFile) return new NextResponse('Not found', { status: 404 });
    return NextResponse.next();
  }
  if (path.startsWith('/data/releases/')) {
    const wikiPage = /^\/data\/releases\/[0-9a-f]{64}\/wiki\/(?:vendors|facts|search-references|raw\/papers)\/(?:[^/\\.]+\/)*[^/\\.]+\.md$/.test(path);
    if (!wikiPage) return new NextResponse('Not found', { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/data/:path*', '/review/:path*', '/api/review/:path*'] };
