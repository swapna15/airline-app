import { NextRequest, NextResponse } from 'next/server';
import { TenantRegistry } from '@/core/tenant/registry';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const tenant = TenantRegistry.get(id);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    return NextResponse.json(tenant);
  }

  return NextResponse.json({ tenants: TenantRegistry.getAll() });
}
