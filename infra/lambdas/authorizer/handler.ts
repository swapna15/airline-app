import type { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
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
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  try {
    const token = event.authorizationToken?.replace(/^Bearer\s+/i, '');
    if (!token) return deny(event.methodArn);

    const secret = process.env.NEXTAUTH_SECRET!;
    const decoded = jwt.verify(token, secret) as NextAuthJWT;

    return allow({
      methodArn: event.methodArn,
      userId: decoded.sub ?? decoded.email ?? 'unknown',
      email: decoded.email ?? '',
      role: decoded.role ?? 'passenger',
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
}): APIGatewayAuthorizerResult {
  // Wildcard the ARN so this policy works for all methods on this API stage
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
