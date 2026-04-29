/**
 * Secret resolution for integration providers.
 *
 * Supported reference forms:
 *   env://VARNAME                                   → read process.env.VARNAME
 *   secretsmanager:arn:aws:secretsmanager:...       → AWS Secrets Manager (dynamic
 *                                                     import; install
 *                                                     @aws-sdk/client-secrets-manager
 *                                                     when needed)
 *   <anything else>                                  → used verbatim (NOT recommended;
 *                                                     plain secrets in env vars
 *                                                     should still go via env://
 *                                                     for clarity)
 *
 * The function is intentionally cheap to call — providers should call it on
 * each cache miss. Secrets Manager has its own caching and per-account
 * throttling; we don't second-guess it. Token rotation is therefore as fast
 * as the provider's cache TTL.
 */

const opaqueImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;

interface SecretsManagerModule {
  SecretsManagerClient: new (cfg: { region?: string }) => {
    send: (cmd: unknown) => Promise<{ SecretString?: string; SecretBinary?: Uint8Array }>;
  };
  GetSecretValueCommand: new (input: { SecretId: string }) => unknown;
}

export async function resolveSecret(ref: string, region?: string): Promise<string> {
  if (ref.startsWith('env://')) {
    const name = ref.slice('env://'.length);
    const v = process.env[name];
    if (!v) throw new Error(`env var ${name} not set (referenced by ${ref})`);
    return v;
  }
  if (ref.startsWith('secretsmanager:')) {
    return resolveSecretsManager(ref.slice('secretsmanager:'.length), region);
  }
  return ref;
}

async function resolveSecretsManager(arnOrName: string, region?: string): Promise<string> {
  let mod: SecretsManagerModule;
  try {
    mod = (await opaqueImport('@aws-sdk/client-secrets-manager')) as SecretsManagerModule;
  } catch {
    throw new Error(
      'secretsmanager: refs require @aws-sdk/client-secrets-manager. Install with: npm install @aws-sdk/client-secrets-manager',
    );
  }
  const client = new mod.SecretsManagerClient({ region: region ?? process.env.AWS_REGION });
  const out = await client.send(new mod.GetSecretValueCommand({ SecretId: arnOrName }));
  if (out.SecretString) return out.SecretString;
  if (out.SecretBinary) return Buffer.from(out.SecretBinary).toString('utf8');
  throw new Error(`empty secret payload for ${arnOrName}`);
}
