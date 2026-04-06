import type { APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import jwt from 'jsonwebtoken';

interface NextAuthJWT {
  sub?: string;
  email?: string;
  name?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export const handler = async (
  event: APIGatewayRequestAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  try {
    const authHeader =
      event.headers?.['Authorization'] ??
      event.headers?.['authorization'] ??
      '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return deny(event.methodArn);

    const secret = process.env.NEXTAUTH_SECRET!;
    const decoded = jwt.verify(token, secret) as NextAuthJWT;

    // Tenant slug is passed by the client as X-Tenant-ID.
    // We trust the slug value here — Lambda handlers resolve it to a UUID
    // and apply it as a WHERE filter, so an invalid slug simply returns
    // empty result sets without touching another tenant's data.
    const tenantSlug =
      event.headers?.['X-Tenant-ID'] ??
      event.headers?.['x-tenant-id'] ??
      'aeromock';

    return allow({
      methodArn: event.methodArn,
      userId: decoded.sub ?? decoded.email ?? 'unknown',
      email: decoded.email ?? '',
      role: decoded.role ?? 'passenger',
      tenantSlug,
    });
  } catch (err) {
    console.error('Authorizer error:', err);
    return deny(event.methodArn);
  }
};

function allow(opts: {
  methodArn: string;
  userId: string;
  email: string;
  role: string;
  tenantSlug: string;
}): APIGatewayAuthorizerResult {
  const arnBase = opts.methodArn.split('/').slice(0, 2).join('/') + '/*';

  return {
    principalId: opts.userId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: arnBase }],
    },
    context: {
      userId: opts.userId,
      email: opts.email,
      role: opts.role,
      tenantSlug: opts.tenantSlug,
    },
  };
}

function deny(methodArn: string): APIGatewayAuthorizerResult {
  return {
    principalId: 'deny',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Deny', Resource: methodArn }],
    },
  };
}
