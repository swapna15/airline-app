import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { TenantRegistry } from '@/core/tenant/registry';
import type { TenantConfig } from '@/types/tenant';

export async function GET(
  _req: NextRequest,
  { params }: { params: { tenantId: string } },
) {
  const tenant = TenantRegistry.get(params.tenantId);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  return NextResponse.json(tenant);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { tenantId: string } },
) {
  const session = await getServerSession(authOptions);
  if ((session?.user as { role?: string })?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (!TenantRegistry.get(params.tenantId)) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const body: Partial<TenantConfig> = await req.json();
  TenantRegistry.applyOverride(params.tenantId, body);
  return NextResponse.json(TenantRegistry.get(params.tenantId));
}
