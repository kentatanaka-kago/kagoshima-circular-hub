import { NextResponse, type NextRequest } from 'next/server';

const REALM = 'Kagoshima Circular Hub Admin';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) {
    return new NextResponse('admin auth not configured', { status: 503 });
  }

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep > 0) {
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === pass) return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  });
}
