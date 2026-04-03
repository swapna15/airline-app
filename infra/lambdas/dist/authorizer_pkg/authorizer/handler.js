"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const handler = async (event) => {
    try {
        const token = event.authorizationToken?.replace(/^Bearer\s+/i, '');
        if (!token)
            return deny(event.methodArn);
        const secret = process.env.NEXTAUTH_SECRET;
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        return allow({
            methodArn: event.methodArn,
            userId: decoded.sub ?? decoded.email ?? 'unknown',
            email: decoded.email ?? '',
            role: decoded.role ?? 'passenger',
        });
    }
    catch (err) {
        console.error('Authorizer error:', err);
        return deny(event.methodArn);
    }
};
exports.handler = handler;
function allow(opts) {
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
function deny(methodArn) {
    return {
        principalId: 'deny',
        policyDocument: {
            Version: '2012-10-17',
            Statement: [{ Action: 'execute-api:Invoke', Effect: 'Deny', Resource: methodArn }],
        },
    };
}
