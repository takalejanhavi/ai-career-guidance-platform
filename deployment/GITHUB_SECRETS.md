# ──────────────────────────────────────────────────────────────────
# GITHUB_SECRETS.md — Required GitHub Actions Secrets
#
# Set via: GitHub repo → Settings → Secrets and variables → Actions
# ──────────────────────────────────────────────────────────────────

## Required Secrets

### JWT Keys (generate fresh for each environment)
```bash
node -e "
  const c = require('crypto');
  const { privateKey, publicKey } = c.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  console.log('STAGING_JWT_PRIVATE_KEY=', JSON.stringify(privateKey));
  console.log('STAGING_JWT_PUBLIC_KEY=',  JSON.stringify(publicKey));
"
```

### Secret Reference

| Secret Name                          | Description                                  | Example / Source           |
|--------------------------------------|----------------------------------------------|---------------------------|
| `JWT_PRIVATE_KEY`                    | RS256 private key (production)               | See generation above       |
| `JWT_PUBLIC_KEY`                     | RS256 public key (production)                | See generation above       |
| `STAGING_JWT_PRIVATE_KEY`            | RS256 private key (staging)                  | See generation above       |
| `STAGING_JWT_PUBLIC_KEY`             | RS256 public key (staging)                   | See generation above       |
| `MONGODB_URI`                        | MongoDB Atlas connection string              | Atlas → Connect → Drivers  |
| `STAGING_MONGODB_URI`                | Staging MongoDB URI                          | Atlas staging cluster      |
| `REDIS_URL`                          | Redis connection string (production)         | Upstash dashboard          |
| `AI_SERVICE_SECRET`                  | Shared secret for AI service auth            | `openssl rand -hex 32`     |
| `SMTP_PASS`                          | Resend API key                               | resend.com → API Keys      |
| `S3_ACCESS_KEY`                      | AWS S3 / Cloudflare R2 access key            | AWS IAM console            |
| `S3_SECRET_KEY`                      | AWS S3 / Cloudflare R2 secret key            | AWS IAM console            |
| `BLOCKCHAIN_PRIVATE_KEY`             | Ethereum wallet private key                  | MetaMask / Hardhat wallet  |
| `CONTRACT_ADDRESS`                   | Deployed CareerReport contract address       | From deploy script output  |
| `RENDER_PROD_BACKEND_DEPLOY_HOOK`    | Render deploy hook URL — backend             | Render dashboard → Deploys |
| `RENDER_PROD_FRONTEND_DEPLOY_HOOK`   | Render deploy hook URL — frontend            | Render dashboard → Deploys |
| `RENDER_PROD_AI_DEPLOY_HOOK`         | Render deploy hook URL — AI service          | Render dashboard → Deploys |
| `RENDER_STAGING_BACKEND_DEPLOY_HOOK` | Staging deploy hook — backend                | Render staging service     |
| `RENDER_STAGING_FRONTEND_DEPLOY_HOOK`| Staging deploy hook — frontend               | Render staging service     |
| `RENDER_STAGING_AI_DEPLOY_HOOK`      | Staging deploy hook — AI service             | Render staging service     |
| `SLACK_WEBHOOK_URL`                  | Slack incoming webhook URL                   | Slack app settings         |
| `CODECOV_TOKEN`                      | Codecov.io upload token                      | codecov.io → settings      |
| `POLYGONSCAN_API_KEY`                | Polygonscan API key for contract verification| polygonscan.com            |

### GitHub Environments Required

Create these in Settings → Environments:

1. **staging**
   - No approval required
   - URL: https://staging.careerguidance.app

2. **production-gate**  ← approval gate
   - Required reviewers: add maintainers
   - Wait timer: 0 minutes

3. **production**
   - URL: https://careerguidance.app
   - Environment secrets: production-specific values

### Generating Secrets Quickly
```bash
# AI service secret (32 bytes)
openssl rand -hex 32

# Redis password
openssl rand -base64 24

# Verify JWT key pair works
node -e "
  const jwt  = require('jsonwebtoken');
  const priv = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  const pub  = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
  const tok  = jwt.sign({ sub: 'test' }, priv, { algorithm: 'RS256' });
  const dec  = jwt.verify(tok, pub, { algorithms: ['RS256'] });
  console.log('JWT roundtrip OK:', dec);
"
```
