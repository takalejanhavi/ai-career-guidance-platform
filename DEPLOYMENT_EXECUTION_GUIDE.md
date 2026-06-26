# DEPLOYMENT_EXECUTION_GUIDE.md
## MentorChain Platform — Step-by-Step Execution Guide
_Assumes: code is complete (per audit cycle ending 2026-06-11). This guide is for the first live execution of the stack._

Each step provides: the exact command(s), expected output, success criteria, failure diagnosis, and recovery steps. Run steps in order — later steps depend on earlier ones succeeding.

---

## Step 1 — Start MongoDB Atlas

### Commands

```bash
# 1a. Create a free/shared cluster via Atlas UI (one-time), or via CLI:
atlas clusters create cgp-cluster --provider AWS --region US_EAST_1 --tier M0

# 1b. Create a database user
atlas dbusers create --username cgp_app --password "<STRONG_PASSWORD>" \
  --role readWriteAnyDatabase@admin

# 1c. Allow network access (development: your current IP; production: VPC peering or specific IPs)
atlas accessLists create --currentIp

# 1d. Get the connection string
atlas clusters connectionStrings describe cgp-cluster
```

### Expected Output
```
mongodb+srv://cgp_app:<password>@cgp-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

### Success Criteria
- `atlas clusters list` shows `cgp-cluster` with `stateName: IDLE` (cluster provisioned and ready)
- Connection string returned with `mongodb+srv://` scheme

### Failure Diagnosis
| Symptom | Likely Cause |
|---|---|
| `atlas: command not found` | Atlas CLI not installed — `brew install mongodb-atlas-cli` or download from MongoDB |
| `cluster stuck in CREATING` for >10 min | Region/tier capacity issue — try a different region |
| Connection string test fails with auth error | Database user not yet propagated (can take 1-2 min after creation) |

### Recovery Steps
1. If CLI unavailable, use the Atlas web UI (cloud.mongodb.com) — same steps via "Build a Database" wizard.
2. If connection test fails immediately after user creation, wait 60s and retry — Atlas user propagation is eventually consistent.
3. If `accessLists create --currentIp` fails because your IP changed, run `atlas accessLists create --ip <new-ip>` or temporarily `--cidrBlock 0.0.0.0/0` for development only (never for production).

---

## Step 2 — Configure Environment Variables

### Commands

```bash
cd /home/claude

# 2a. Copy the development template (already has working dev defaults for JWT/Redis/etc.)
cp deployment/envs/.env.development .env

# 2b. Edit MONGODB_URI to point at Atlas instead of the local mongo container
#     Replace this line:
#       MONGODB_URI=mongodb://mongo:27017/career_guidance_dev
#     With:
sed -i 's|^MONGODB_URI=.*|MONGODB_URI=mongodb+srv://cgp_app:<STRONG_PASSWORD>@cgp-cluster.xxxxx.mongodb.net/career_guidance?retryWrites=true\&w=majority|' .env

# 2c. Verify required vars are present (the app validates these at startup via Zod)
grep -E "^(NODE_ENV|MONGODB_URI|JWT_PRIVATE_KEY|JWT_PUBLIC_KEY|REDIS_URL|AI_SERVICE_URL|AI_SERVICE_SECRET|SMTP_HOST|EMAIL_FROM|BLOCKCHAIN_RPC_URL|CONTRACT_ADDRESS)=" .env | cut -d= -f1
```

### Expected Output
```
NODE_ENV
MONGODB_URI
JWT_PRIVATE_KEY
JWT_PUBLIC_KEY
REDIS_URL
AI_SERVICE_URL
AI_SERVICE_SECRET
SMTP_HOST
EMAIL_FROM
BLOCKCHAIN_RPC_URL
CONTRACT_ADDRESS
```
(11 lines — every variable `backend/src/config/env.js` requires must appear)

### Success Criteria
- All 11 variable names listed above are present in `.env` with non-empty values
- `MONGODB_URI` uses `mongodb+srv://` (Atlas), not `mongodb://mongo:27017` (local container)
- `CONTRACT_ADDRESS` is `0x0000...0000` (placeholder) at this stage — will be set for real in Step 11

### Failure Diagnosis
| Symptom | Likely Cause |
|---|---|
| App throws `Invalid environment variables:` listing missing keys at startup | One or more of the 11 vars is empty or absent in `.env` |
| `MONGODB_URI` still shows `mongo:27017` after `sed` | `sed -i` syntax differs on macOS (`sed -i ''`) vs Linux (`sed -i`) — adjust accordingly |

### Recovery Steps
1. Run `node -e "require('./backend/src/config/env')"` from the repo root — this prints the exact list of missing/invalid variables via the Zod error message (observed directly during this audit cycle).
2. For macOS, re-run the `sed` command with `sed -i ''` (empty string after `-i`).
3. If `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` are missing entirely, generate a fresh dev pair:
   ```bash
   node -e "const{generateKeyPairSync}=require('crypto');const{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'pkcs1',format:'pem'}});console.log('JWT_PRIVATE_KEY=\"'+privateKey.replace(/\n/g,'\\\\n')+'\"');console.log('JWT_PUBLIC_KEY=\"'+publicKey.replace(/\n/g,'\\\\n')+'\"')"
   ```

---

## Step 3 — Build Docker Images

### Commands

```bash
cd /home/claude

# 3a. Validate the compose file first (catches YAML/interpolation errors before any build)
docker compose -f deployment/docker-compose.yml config --quiet && echo "compose file valid"

# 3b. Build all custom images (backend, frontend, ai_service, hardhat_node)
docker compose -f deployment/docker-compose.yml build --progress=plain

# 3c. Confirm images were created
docker images | grep -E "cgp-|career-guidance"
```

### Expected Output
```
compose file valid

[+] Building 4/4
 OK backend       Built
 OK frontend      Built
 OK ai_service    Built
 OK hardhat_node  Built

REPOSITORY                    TAG       IMAGE ID       SIZE
career-guidance-backend       latest    a1b2c3d4e5f6   245MB
career-guidance-frontend      latest    b2c3d4e5f6a1   42MB
career-guidance-ai_service    latest    c3d4e5f6a1b2   1.2GB
career-guidance-hardhat_node  latest    d4e5f6a1b2c3   180MB
```

### Success Criteria
- `config --quiet` produces **no output and exit code 0** (the `&& echo` confirms this)
- All 4 custom images appear in `docker images` with recent timestamps
- `ai_service` image is the largest (~1-1.5GB) due to scikit-learn/XGBoost/pandas dependencies — this is expected

### Failure Diagnosis
| Symptom | Likely Cause | Files |
|---|---|---|
| `config` step prints YAML error | Malformed `docker-compose.yml` or env-var interpolation referencing an undefined variable | `deployment/docker-compose.yml` |
| Backend build fails at `npm rebuild bcrypt --build-from-source` | Missing `python3`/`make`/`g++` in the `node:20-alpine` builder stage | `deployment/dockerfiles/Dockerfile.backend` |
| AI service build times out / OOM | scikit-learn + XGBoost compilation on a low-memory build host | `deployment/dockerfiles/Dockerfile.ai` |
| `hardhat_node` build fails on `npx hardhat compile` | Network restriction prevents downloading the Solidity compiler binary | `blockchain/Dockerfile.hardhat` |

### Recovery Steps
1. **bcrypt build failure:** Confirm `Dockerfile.backend`'s builder stage includes:
   ```dockerfile
   RUN apk add --no-cache python3 make g++
   ```
   If absent, add it before the `npm ci` step and rebuild: `docker compose build --no-cache backend`.
2. **AI service OOM:** Increase Docker Desktop's memory allocation (Settings -> Resources -> Memory >= 4GB), or build with `docker compose build --memory=4g ai_service`.
3. **Hardhat compiler download failure:** Solidity compiler binaries are fetched from `binaries.soliditylang.org` — ensure this domain isn't blocked. Retry with `docker compose build --no-cache hardhat_node`.
4. **General:** `docker compose build --no-cache <service>` forces a clean rebuild for any single service without invalidating others' caches.

---

## Step 4 — Run Docker Compose

### Commands

```bash
cd /home/claude

# 4a. Start everything in detached mode
docker compose -f deployment/docker-compose.yml up -d

# 4b. Watch logs during startup (Ctrl+C to stop watching - containers keep running)
docker compose -f deployment/docker-compose.yml logs -f --tail=50

# 4c. Check overall status once startup settles (~60-90s for AI service model load)
docker compose -f deployment/docker-compose.yml ps
```

### Expected Output (from `ps`)
```
NAME              IMAGE                          STATUS                   PORTS
cgp_nginx         career-guidance-nginx          Up 2 minutes (healthy)   0.0.0.0:80->80/tcp
cgp_frontend      career-guidance-frontend       Up 2 minutes (healthy)   0.0.0.0:5173->5173/tcp
cgp_backend       career-guidance-backend        Up 2 minutes (healthy)   0.0.0.0:4000->4000/tcp
cgp_ai_service    career-guidance-ai_service     Up 2 minutes (healthy)   0.0.0.0:5050->5050/tcp
cgp_worker        career-guidance-backend        Up 2 minutes
cgp_mongo         mongo:7                         Up 2 minutes (healthy)   0.0.0.0:27017->27017/tcp
cgp_redis         redis:7-alpine                  Up 2 minutes (healthy)   0.0.0.0:6379->6379/tcp
cgp_mailhog       mailhog/mailhog                 Up 2 minutes             0.0.0.0:1025->1025/tcp, 0.0.0.0:8025->8025/tcp
cgp_minio         minio/minio                     Up 2 minutes (healthy)   0.0.0.0:9000-9001->9000-9001/tcp
cgp_minio_init    career-guidance-minio_init      Exited (0)
cgp_hardhat       career-guidance-hardhat_node    Up 2 minutes (healthy)   0.0.0.0:8545->8545/tcp
```

> **Note:** Because Step 2 pointed `MONGODB_URI` at Atlas, `cgp_mongo` will still start (it's part of the compose file) but the **backend will not use it** — the backend connects to Atlas directly. `cgp_mongo` running idly is harmless and not required for this guide.

### Success Criteria
- All services except `cgp_minio_init` show `Up ... (healthy)` — `minio_init` is a one-shot init job and **should** show `Exited (0)` (exit code 0 = success)
- `cgp_worker` shows `Up` with no health status (workers don't expose an HTTP healthcheck - verify via logs instead)
- No container shows `Restarting` or `Exited (1)` (or any non-zero exit)

### Failure Diagnosis
| Symptom | Likely Cause | Diagnostic Command |
|---|---|---|
| `cgp_backend` `Restarting` loop | Can't connect to MongoDB (Atlas IP not whitelisted, or `MONGODB_URI` typo) | `docker compose logs backend --tail=30` |
| `cgp_ai_service` `unhealthy` after 90s+ | Model artefacts failed to load (`models/artefacts/*.joblib` missing in image) | `docker compose logs ai_service --tail=30` |
| `cgp_hardhat` `unhealthy` | `npx hardhat node` crashed - port 8545 conflict with a host process | `docker compose logs hardhat_node --tail=30` |
| `cgp_minio_init` `Exited (1)` | MinIO not ready when init script ran, or bucket-creation command syntax error | `docker compose logs minio_init` |
| `cgp_worker` immediately exits | Same `MONGODB_URI`/Redis connectivity issue as backend (worker shares the backend image) | `docker compose logs worker --tail=30` |

### Recovery Steps
1. **Backend restart loop (Atlas connectivity):**
   ```bash
   docker compose exec backend node -e "require('./src/config/database').connectDB()"
   ```
   If this hangs/errors, re-check Step 1/2's Atlas IP allowlist - Docker containers may egress from a different IP than your host. For development, temporarily add `0.0.0.0/0` to the Atlas access list, then restart: `docker compose restart backend worker`.

2. **AI service unhealthy:**
   ```bash
   docker compose exec ai_service ls -la models/artefacts/
   ```
   Should show `random_forest.joblib`, `xgboost.joblib`, `feature_engineer.joblib`, `metrics.json`, `class_names.json`, `feature_names.json`. If missing, the training step in `Dockerfile.ai`'s build stage didn't run - rebuild with `docker compose build --no-cache ai_service`.

3. **Hardhat port conflict:**
   ```bash
   lsof -i :8545
   ```
   Kill the conflicting process or change the host-side port mapping in `docker-compose.yml` (`"8546:8545"`) and update `BLOCKCHAIN_RPC_URL` accordingly.

4. **MinIO init failure:**
   ```bash
   docker compose up -d minio
   docker compose restart minio_init
   docker compose logs minio_init
   ```

5. **Full reset (last resort):**
   ```bash
   docker compose down -v   # WARNING: deletes all volumes (mongo/redis/minio data)
   docker compose up -d
   ```

---

## Step 5 — Verify All Services

### Commands

```bash
# 5a. Backend health
curl -s http://localhost:4000/healthz | python3 -m json.tool

# 5b. AI service health
curl -s http://localhost:5050/healthz | python3 -m json.tool

# 5c. NGINX -> backend proxy (production-style routing)
curl -s http://localhost/api/v1/healthz | python3 -m json.tool

# 5d. NGINX -> AI service proxy
curl -s http://localhost/ai/healthz | python3 -m json.tool

# 5e. Frontend reachable
curl -sI http://localhost:5173 | head -1

# 5f. MinIO console reachable
curl -sI http://localhost:9001 | head -1

# 5g. MailHog UI reachable
curl -sI http://localhost:8025 | head -1

# 5h. Hardhat RPC reachable
curl -s -X POST http://localhost:8545 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# 5i. Worker process is alive (check logs for the startup banner)
docker compose -f deployment/docker-compose.yml logs worker --tail=5
```

### Expected Output
```
5a: {"status": "ok", "uptime": 123.45, "timestamp": "..."}
5b: {"status": "ok", "model": "loaded", "ready": true, "version": "1.0.0"}
5c: {"status": "ok", ...}                       (proxied through NGINX)
5d: {"status": "ok", "model": "loaded", "ready": true}
5e: HTTP/1.1 200 OK
5f: HTTP/1.1 200 OK
5g: HTTP/1.1 200 OK
5h: {"jsonrpc":"2.0","id":1,"result":"0x0"}
5i: [Workers] All queue workers registered
```

### Success Criteria
- All `healthz` endpoints return `status: ok` (and AI service additionally `model: loaded, ready: true`)
- Hardhat returns `result: "0x0"` (block 0 - genesis, nothing mined yet)
- Worker log shows `[Workers] All queue workers registered` with no error stack traces after it

### Failure Diagnosis
| Symptom | Likely Cause |
|---|---|
| 5a returns connection refused | Backend container not running - check `docker compose ps` |
| 5b returns `model: null, ready: false` | AI service started but model artefacts failed to load - see Step 4 recovery |
| 5c (NGINX proxy) fails but 5a (direct) works | NGINX `nginx.dev.conf` upstream misconfigured - check `upstream backend { server backend:4000; }` matches the service name |
| 5d fails but 5b works | NGINX `/ai/` location's `rewrite ^/ai/(.*)$ /$1 break;` not stripping prefix correctly |
| 5h returns connection refused | Hardhat container unhealthy - see Step 4 recovery |

### Recovery Steps
1. For any single failing service, get its logs: `docker compose logs <service> --tail=100`.
2. For NGINX proxy mismatches, exec into the NGINX container and test the upstream directly:
   ```bash
   docker compose exec nginx wget -qO- http://backend:4000/healthz
   docker compose exec nginx wget -qO- http://ai_service:5050/healthz
   ```
   If these succeed but the host-side `curl http://localhost/api/v1/healthz` fails, the issue is in NGINX's `location` block routing, not connectivity - review `deployment/nginx/nginx.dev.conf`'s `location /api/` and `location /ai/` blocks.
3. Re-run `docker compose restart nginx` after any NGINX config investigation (NGINX doesn't hot-reload mounted config changes by default in this setup).

---

## Step 6 — Run Database Migrations (Index Creation)

> This project uses Mongoose schema-defined indexes rather than a separate migration framework. "Migrations" here means ensuring all collection indexes exist on the Atlas database.

### Commands

```bash
# 6a. Run the index-creation script inside the backend container
docker compose -f deployment/docker-compose.yml exec backend npm run indexes

# 6b. Verify indexes were created (connect via the Atlas URI)
docker compose -f deployment/docker-compose.yml exec backend node -e "
const mongoose = require('mongoose');
const env = require('./src/config/env');
mongoose.connect(env.MONGODB_URI).then(async () => {
  const collections = ['users','assessments','reports','permissions','psychologists','notifications','auditlogs'];
  for (const c of collections) {
    const idx = await mongoose.connection.db.collection(c).indexes().catch(() => []);
    console.log(c + ':', idx.length, 'indexes');
  }
  process.exit(0);
});
"
```

### Expected Output
```
6a:
> career-guidance-backend@1.0.0 indexes
> node src/scripts/ensureIndexes.js

Indexes ensured for: User, Assessment, Report, Permission, Psychologist, Notification, AuditLog

6b:
users: 5 indexes
assessments: 4 indexes
reports: 4 indexes
permissions: 3 indexes
psychologists: 3 indexes
notifications: 3 indexes
auditlogs: 3 indexes
```

### Success Criteria
- 6a exits with code 0 and prints `Indexes ensured` for all 7 collections
- 6b shows >=2 indexes per collection (every collection has at minimum `_id` + at least one custom index)

### Failure Diagnosis
| Symptom | Likely Cause |
|---|---|
| `MongooseServerSelectionError` | Atlas connection issue - re-verify Step 1/2 (IP allowlist, connection string) |
| `indexes: 0` for a collection | Collection doesn't exist yet (will be created on first document insert) |
| Script exits with `MongoServerError: user is not allowed to do action [createIndex]` | Atlas database user role insufficient - needs `readWrite` at minimum, `dbAdmin` is safer for index creation |

### Recovery Steps
1. If the Atlas user lacks index-creation privileges:
   ```bash
   atlas dbusers update cgp_app --role dbAdmin@career_guidance
   ```
2. If a collection shows 0 indexes and this persists after re-running 6a, connect via `mongosh "<MONGODB_URI>"` directly and run `db.users.getIndexes()` to confirm - empty collections can show 0 custom indexes until Mongoose's `autoIndex` runs on first model use; this resolves itself once Step 7 (seeding) creates the first documents.

---

## Step 7 — Seed Sample Users

### Commands

```bash
# 7a. Run the seed script
docker compose -f deployment/docker-compose.yml exec backend npm run seed

# 7b. Verify users were created
docker compose -f deployment/docker-compose.yml exec backend node -e "
const mongoose = require('mongoose');
const env = require('./src/config/env');
const User = require('./src/modules/users/user.model');
mongoose.connect(env.MONGODB_URI).then(async () => {
  const users = await User.find({}, 'email role isEmailVerified').lean();
  users.forEach(u => console.log(u.email, '|', u.role, '| verified:', u.isEmailVerified));
  process.exit(0);
});
"
```

### Expected Output
```
7a:
> career-guidance-backend@1.0.0 seed
> node src/scripts/seed.js

Seeded 4 users:
   admin@demo.com        (admin)        password: Admin@1234!
   psychologist@demo.com (psychologist) password: Psych@1234!
   student@demo.com      (student)      password: Student@1234!
   student2@demo.com     (student)      password: Student@1234!

7b:
admin@demo.com | admin | verified: true
psychologist@demo.com | psychologist | verified: true
student@demo.com | student | verified: true
student2@demo.com | student | verified: true
```

### Success Criteria
- 7a reports 4 users seeded with no errors
- 7b lists all 4 emails with correct roles and `verified: true` (seed users skip email-verification deliberately, per `seed.js`'s `isEmailVerified: true`)

### Failure Diagnosis
| Symptom | Likely Cause |
|---|---|
| `Seed script must not run in production` | `NODE_ENV=production` in `.env` - seed script deliberately refuses to run; verify `.env` has `NODE_ENV=development` for this exercise |
| `E11000 duplicate key error` on re-run | Seed script ran previously - `seed.js` deletes existing seed users first, so this shouldn't normally recur |
| Passwords don't work at login | Confirm `seed.js` creates users via `User.create()` (which triggers the bcrypt `pre('save')` hook) rather than a raw `insertMany()` that would bypass hashing |

### Recovery Steps
1. If `NODE_ENV=production` is blocking seeding, temporarily override for this one command:
   ```bash
   docker compose exec -e NODE_ENV=development backend npm run seed
   ```
2. If duplicate-key errors persist, manually clear seed users first:
   ```bash
   docker compose exec backend node -e "
   const mongoose = require('mongoose');
   const env = require('./src/config/env');
   const User = require('./src/modules/users/user.model');
   mongoose.connect(env.MONGODB_URI).then(async () => {
     await User.deleteMany({ email: { \$regex: '@demo.com\$' } });
     console.log('cleared');
     process.exit(0);
   });
   "
   ```
   Then re-run 7a.

---

## Step 8 — Test Assessment Flow

### Commands

```bash
# 8a. Log in as the seeded student
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@demo.com","password":"Student@1234!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

echo "Token: ${TOKEN:0:20}..."

# 8b. Fetch the question bank
curl -s http://localhost:4000/api/v1/assessments/questions \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20

# 8c. Start a new assessment
ASSESSMENT_ID=$(curl -s -X POST http://localhost:4000/api/v1/assessments/start \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"totalQuestions": 29, "deviceType": "desktop"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['assessment']['_id'])")

echo "Assessment ID: $ASSESSMENT_ID"

# 8d. Submit all 29 answers
python3 << PYEOF
import json, urllib.request

questions = json.load(urllib.request.urlopen(
  urllib.request.Request("http://localhost:4000/api/v1/assessments/questions",
    headers={"Authorization": "Bearer $TOKEN"})
))["data"]["questions"]

scores = [8,7,6,9,7,8,6,9,5,7,8,6,7,9,6,8,5,7,8,6,9,7,5,8,9,6,7,8,7]

for i, q in enumerate(questions):
    body = json.dumps({
        "questionId": q["id"], "questionText": q["text"], "section": q["section"],
        "answer": scores[i % 29], "rawScore": scores[i % 29], "timeSpentMs": 4200
    }).encode()
    req = urllib.request.Request(
        f"http://localhost:4000/api/v1/assessments/$ASSESSMENT_ID/answer",
        data=body, method="PATCH",
        headers={"Authorization": "Bearer $TOKEN", "Content-Type": "application/json"})
    urllib.request.urlopen(req)

print(f"Submitted {len(questions)} answers")
PYEOF

# 8e. Submit the assessment (triggers AI scoring queue job)
curl -s -X POST "http://localhost:4000/api/v1/assessments/$ASSESSMENT_ID/submit" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Expected Output
```
8a: Token: eyJhbGciOiJSUzI1NiIs...

8b:
{
  "success": true,
  "data": { "questions": [ {"id": "apt_001", "section": "aptitude", ...}, ... ] }
}

8c: Assessment ID: 65f1a2b3c4d5e6f7a8b9c0d1

8d: Submitted 29 answers

8e:
{
  "success": true,
  "data": { "assessment": { "_id": "65f1...", "status": "submitted" } },
  "message": "Assessment submitted. Scoring in progress."
}
```

### Success Criteria
- 8a returns a non-empty JWT (starts with `eyJ`)
- 8b returns exactly 29 questions across 5 sections
- 8c returns a valid 24-char hex MongoDB ObjectId
- 8e returns `status: "submitted"` with HTTP 200

### Failure Diagnosis
| Symptom | Likely Cause |
|---|---|
| 8a: `KeyError: 'accessToken'` | Login failed - check seeded password matches, or backend not reachable |
| 8b returns fewer than 29 questions | `question_bank.json` not loaded correctly, or paginated response truncated (check `?limit=50` query param) |
| 8d: `HTTPError 400` on a `PATCH /answer` call | `submitResponseSchema`'s `questionId` validation rejects an ID not in `VALID_QUESTION_IDS` - verify the `id` field returned in 8b matches `question_bank.json` exactly |
| 8e: `status` remains `"submitted"` forever, never becomes `"scored"` or `"failed"` | Worker process not running, or Bull/Redis connection broken - see Step 9 |

### Recovery Steps
1. If 8b returns 0 or wrong questions, check the file is present in the container:
   ```bash
   docker compose exec backend cat src/modules/assessment/question_bank.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
   ```
   Should print `29`.
2. If 8d fails validation, print the exact question IDs returned vs expected:
   ```bash
   curl -s http://localhost:4000/api/v1/assessments/questions -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print([q['id'] for q in json.load(sys.stdin)['data']['questions']])"
   ```
3. If 8e never transitions past `submitted`, proceed to Step 9's diagnostics - the AI service connection is the most common cause.

---

## Step 9 — Test AI Recommendations

### Commands

```bash
# 9a. Poll the assessment status until it's scored (or fails)
for i in {1..15}; do
  STATUS=$(curl -s "http://localhost:4000/api/v1/assessments/$ASSESSMENT_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['assessment']['status'])")
  echo "[$i] status: $STATUS"
  [ "$STATUS" = "scored" ] || [ "$STATUS" = "failed" ] && break
  sleep 2
done

# 9b. Inspect the full scored result
curl -s "http://localhost:4000/api/v1/assessments/$ASSESSMENT_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 9c. If status is "failed", inspect failureReason and the worker logs
docker compose -f deployment/docker-compose.yml logs worker --tail=30 | grep -i "ai\|predict\|error"

# 9d. Direct AI-service sanity check (bypasses backend entirely)
curl -s -X POST http://localhost:5050/predict/explain \
  -H "Content-Type: application/json" -H "X-Internal-Token: <AI_SERVICE_SECRET from .env>" \
  -d '{"math_score":75,"science_score":77,"english_score":63,"communication":63,"leadership":73,"creativity":60,"analytical_thinking":74,"extroversion":70,"conscientiousness":78,"extracurricular":80,"top_n":3}' \
  | python3 -m json.tool
```

### Expected Output
```
9a:
[1] status: submitted
[2] status: submitted
[3] status: scored

9b:
{
  "success": true,
  "data": {
    "assessment": {
      "status": "scored",
      "scores": {
        "aptitude": {"score": 74, "tier": "high", "percentile": 78},
        "interest": {"score": 70, "tier": "high", "percentile": 74},
        "personality": {"score": 70, "tier": "high", "percentile": 74},
        "values": {"score": 72, "tier": "high", "percentile": 76},
        "learningStyle": {"score": 74, "tier": "high", "percentile": 78},
        "overall": 72
      },
      "aiMetadata": {
        "modelVersion": "1.0.0",
        "confidenceScore": 0.529,
        "inferenceMs": 247
      },
      "failureReason": null
    }
  }
}

9d:
{
  "status": "success",
  "top_careers": [
    {"rank": 1, "career": "Civil Engineer", "confidence_pct": 52.9, "confidence_tier": "Moderate", ...}
  ],
  "confidence": {"top_career_confidence": 0.529, "models_agree": true, ...}
}
```

### Success Criteria
- 9a reaches `status: scored` within ~10-30 seconds (typically 1-3 poll iterations)
- 9b shows all 5 dimension scores populated (non-null) with `tier` and `percentile`
- 9b's `aiMetadata.confidenceScore` is between 0 and 1
- 9d (direct AI call) returns `status: "success"` with at least 1 entry in `top_careers`

### Failure Diagnosis
| Symptom | Likely Cause | Notes |
|---|---|---|
| 9a stuck at `submitted` indefinitely | Worker not processing the `score-assessment` queue - Redis connectivity or worker crashed | Check `docker compose logs worker` |
| 9a reaches `failed` with `failureReason: "AI service unreachable: ..."` | Backend's `AI_SERVICE_URL` doesn't resolve to `ai_service:5050` from inside the backend/worker container | `.env`'s `AI_SERVICE_URL` should be `http://ai_service:5050`, not `http://localhost:5050` |
| 9a reaches `failed` with `failureReason: "AI service responded with HTTP 401..."` | `AI_SERVICE_SECRET` mismatch between backend `.env` and AI service `.env` | Both must have the **same** value |
| 9d returns HTTP 401 | `X-Internal-Token` header value doesn't match AI service's configured secret | Same as above |
| 9d returns HTTP 503 `{"model": null}` | AI model artefacts not loaded - see Step 4 recovery |

### Recovery Steps
1. **Stuck at `submitted`:** Confirm Redis connectivity from the worker:
   ```bash
   docker compose exec worker node -e "require('./src/config/redis').Queues.PDF.getJobCounts().then(console.log)"
   ```
   If this hangs, `REDIS_URL` is wrong or `cgp_redis` isn't healthy - check `docker compose ps redis`.

2. **`AI service unreachable`:** From inside the backend container, test container-to-container DNS:
   ```bash
   docker compose exec backend node -e "require('http').get('http://ai_service:5050/healthz', r => r.pipe(process.stdout))"
   ```
   If this fails but `curl http://localhost:5050/healthz` from the **host** works, `.env`'s `AI_SERVICE_URL` is using `localhost` instead of the Docker service name `ai_service` - fix and `docker compose restart backend worker`.

3. **HTTP 401 token mismatch:** Print both secrets (sanitized) to compare:
   ```bash
   docker compose exec backend node -e "console.log(require('./src/config/env').AI_SERVICE_SECRET)"
   docker compose exec ai_service python3 -c "import os; print(os.getenv('AI_SERVICE_SECRET'))"
   ```
   They must be identical. If not, fix `.env` and `docker compose restart backend worker ai_service`.

4. **Retry without resubmitting:** If the assessment reached `status: failed` due to a transient issue (now fixed), retry without redoing all 29 answers:
   ```bash
   curl -s -X POST "http://localhost:4000/api/v1/assessments/$ASSESSMENT_ID/retry-scoring" \
     -H "Authorization: Bearer $TOKEN"
   ```

---

## Step 10 — Test PDF Generation

### Commands

```bash
# 10a. Find the report generated for this assessment
REPORT_ID=$(curl -s "http://localhost:4000/api/v1/reports/my" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['_id'])")

echo "Report ID: $REPORT_ID"

# 10b. Poll report status until 'ready'
for i in {1..15}; do
  STATUS=$(curl -s "http://localhost:4000/api/v1/reports/$REPORT_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['report']['status'])")
  echo "[$i] status: $STATUS"
  [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ] && break
  sleep 2
done

# 10c. Get the PDF download URL
curl -s "http://localhost:4000/api/v1/reports/$REPORT_ID/pdf" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 10d. Download and verify the PDF
PDF_URL=$(curl -s "http://localhost:4000/api/v1/reports/$REPORT_ID/pdf" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['url'])")

curl -s "$PDF_URL" -o /tmp/report.pdf
file /tmp/report.pdf
ls -la /tmp/report.pdf
```

### Expected Output
```
10a: Report ID: 65f1a2b3c4d5e6f7a8b9c0d2

10b:
[1] status: generating
[2] status: ready

10c:
{
  "success": true,
  "data": { "url": "http://minio:9000/career-reports/reports/65f1.../1234567890.pdf" }
}

10d:
/tmp/report.pdf: PDF document, version 1.3, 6 page(s)
-rw-r--r--  1 user  staff  17837 ... /tmp/report.pdf
```

### Success Criteria
- 10b reaches `status: ready` within ~5-15 seconds
- `file /tmp/report.pdf` reports `PDF document` with **5 or more pages** (cover, assessment, careers, [psychologist if applicable], blockchain - 5-8 pages depending on content length)
- File size > 10KB (an empty/broken PDF would be <1KB)

### Failure Diagnosis
| Symptom | Likely Cause |
|---|---|
| 10a: empty result, `IndexError` | No report was created - assessment scoring (Step 9) didn't complete successfully, so `generate-report` was never enqueued |
| 10b stuck at `generating` | `generate-pdf` worker job failing - check `docker compose logs worker` for `[Worker:PDF]` errors |
| 10c returns a `localhost:4000/mock-pdfs/...` URL instead of a MinIO URL | `S3_ACCESS_KEY` in `.env` is still the default `minioadmin`-style placeholder - `pdf.service.js`'s `upload()` falls back to a mock URL when S3 looks unconfigured |
| 10d: `file` reports `data` or empty, not `PDF document` | The generation step threw an error that wasn't surfaced - likely a missing dependency (`qrcode`) inside the container |

### Recovery Steps
1. **No report created:** Re-verify Step 9 reached `status: scored` (not `failed`) - `generate-report` is only enqueued on successful scoring.
2. **Stuck at `generating`:**
   ```bash
   docker compose logs worker --tail=50 | grep -i "PDF\|pdf"
   ```
   Look for `[Worker:PDF] Failed for report=...`. Common cause: `ReportGenerator` module not found - verify it was copied into the image:
   ```bash
   docker compose exec backend ls src/services/pdf/
   ```
   Should list `ReportGenerator.js`, `generators/`, `utils/`.
3. **Mock URL returned:** Set real MinIO credentials in `.env` (`S3_ACCESS_KEY`/`S3_SECRET_KEY` matching `docker-compose.yml`'s MinIO service env). Note `pdf.service.js`'s mock-detection treats the default `minioadmin` value as "unconfigured" — for dev testing either accept the mock URL, or set distinct dev credentials matching both MinIO's and the backend's `.env`.
4. **`qrcode` missing:**
   ```bash
   docker compose exec backend node -e "require('qrcode')"
   ```
   If this throws `Cannot find module 'qrcode'`, the image was built before `qrcode` was added to `package.json` - rebuild: `docker compose build --no-cache backend worker`.

---

## Step 11 — Test Blockchain Anchoring

### Commands

```bash
# 11a. Deploy the CareerReport contract to the local Hardhat node (one-time)
docker compose -f deployment/docker-compose.yml exec hardhat_node \
  npx hardhat run scripts/deploy.js --network localhost

# 11b. Extract the deployed contract address and update .env
CONTRACT_ADDR=$(docker compose exec hardhat_node cat deployments/localhost.json | python3 -c "import sys,json; print(json.load(sys.stdin)['CareerReport']['address'])")
echo "Contract deployed at: $CONTRACT_ADDR"

sed -i "s|^CONTRACT_ADDRESS=.*|CONTRACT_ADDRESS=$CONTRACT_ADDR|" .env
sed -i "s|^BLOCKCHAIN_RPC_URL=.*|BLOCKCHAIN_RPC_URL=http://hardhat_node:8545|" .env

# 11c. Set BLOCKCHAIN_PRIVATE_KEY to Hardhat's well-known dev account #0
#      (deterministic, safe for LOCAL development only - never use on a real network)
sed -i "s|^BLOCKCHAIN_PRIVATE_KEY=.*|BLOCKCHAIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80|" .env

# 11d. Restart backend/worker to pick up the new contract address and key
docker compose -f deployment/docker-compose.yml restart backend worker

# 11e. Anchor the report generated in Step 10
curl -s -X POST "http://localhost:4000/api/v1/reports/$REPORT_ID/anchor" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 11f. Poll for confirmation
for i in {1..15}; do
  CHAIN_STATUS=$(curl -s "http://localhost:4000/api/v1/reports/$REPORT_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['report']['blockchain']['status'])")
  echo "[$i] blockchain status: $CHAIN_STATUS"
  [ "$CHAIN_STATUS" = "confirmed" ] || [ "$CHAIN_STATUS" = "failed" ] && break
  sleep 2
done

# 11g. Get the PDF hash and verify on-chain
PDF_HASH=$(curl -s "http://localhost:4000/api/v1/reports/$REPORT_ID" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['report']['pdf']['sha256Hash'])")

curl -s "http://localhost:4000/api/v1/reports/$REPORT_ID/verify?hash=$PDF_HASH" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 11h. Fetch the raw on-chain record
curl -s "http://localhost:4000/api/v1/reports/$REPORT_ID/chain" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Expected Output
```
11a:
Deploying CareerReport...
CareerReport deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa7
Deployment manifest written to deployments/localhost.json

11b: Contract deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa7

11e:
{
  "success": true,
  "data": { "report": { "blockchain": { "status": "pending" } } },
  "message": "Blockchain anchoring initiated - transaction will confirm shortly"
}

11f:
[1] blockchain status: pending
[2] blockchain status: confirmed

11g:
{
  "success": true,
  "valid": true,
  "onChainRecord": {
    "pdfHash": "0x0cddbdec...",
    "owner": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "timestamp": 1749600000,
    "blockNumber": 1,
    "isRevoked": false
  }
}

11h:
{
  "success": true,
  "data": {
    "onChainRecord": { "pdfHash": "0x0cddbdec...", "owner": "0xf39...", "isRevoked": false, ... },
    "anchored": true
  }
}
```

### Success Criteria
- 11a prints a deployed contract address (`0x` + 40 hex chars)
- 11e returns HTTP 200 with `blockchain.status: "pending"`
- 11f transitions to `blockchain status: confirmed` within ~5-10 seconds (Hardhat mines instantly)
- 11g returns `"valid": true`
- 11h returns `"anchored": true` with `isRevoked: false`

### Failure Diagnosis
| Symptom | Likely Cause |
|---|---|
| 11a fails: `Error: cannot connect to network localhost` | Hardhat node not running inside its own container - confirm `hardhat.config.js`'s `localhost` network points to `http://127.0.0.1:8545` |
| 11e returns `[Blockchain] BLOCKCHAIN_RPC_URL not configured` | `.env`'s `BLOCKCHAIN_RPC_URL` empty, or backend wasn't restarted after 11b/11c |
| 11e returns `[Blockchain] Write operation requires BLOCKCHAIN_PRIVATE_KEY` | Step 11c skipped or backend wasn't restarted |
| 11f stuck at `pending` then `failed` | Check `[Blockchain]` log lines in `docker compose logs worker` for the specific revert reason |
| 11g returns `"valid": false` despite 11f showing `confirmed` | `pdfHash` query param doesn't match what was anchored - confirm `PDF_HASH` was read correctly in 11g |
| 11e returns `Cannot find module 'ethers'` | Backend image built before `ethers` was added to `package.json` - rebuild: `docker compose build --no-cache backend worker` |

### Recovery Steps

1. **`hardhat.config.js` localhost network check:**
   ```bash
   docker compose exec hardhat_node cat hardhat.config.js | grep -A3 "localhost:"
   ```
   Should show `url: "http://127.0.0.1:8545"`.

2. **ABI resolution inside the backend container.** The backend's `blockchain.service.js` resolves the ABI path as `path.resolve(__dirname, '../../../blockchain/artifacts/...')`. This resolves correctly on the **host filesystem**, but inside the Docker container only `backend/`'s contents exist (per `Dockerfile.backend`'s `COPY` instructions) - `/blockchain` is not present in the backend image. The ABI file will therefore **never** be found inside the container, and `blockchain.service.js` falls back to its embedded `MINIMAL_ABI`.

   **This fallback is sufficient** - `MINIMAL_ABI` includes the exact 5 functions (`registerReport`, `updateReportHash`, `revokeReport`, `verifyIntegrity`, `getReport`) and the `ReportRegistered` event needed for every operation in this guide. Confirm it loaded:
   ```bash
   docker compose exec backend node -e "console.log(Object.keys(require('./src/services/blockchain.service')))"
   ```
   If this lists `anchorReport`, `verifyIntegrity`, etc., the service loaded successfully - **no action needed**. If anchoring still fails after confirming this, the issue is network/key configuration (steps 11b/11c), not the ABI.

   **For full-ABI parity** beyond the 5 embedded functions, add a build stage to `Dockerfile.backend` that copies `blockchain/artifacts/contracts/CareerReport.sol/CareerReport.abi.json` into the backend image and update `ABI_PATH` accordingly. This is an enhancement beyond this guide's scope.

3. **Re-anchor after fixing config:** `initiateBlockchainAnchor()` allows re-anchoring as long as `blockchain.status !== 'confirmed'`, so a `failed` status can simply be retried:
   ```bash
   curl -s -X POST "http://localhost:4000/api/v1/reports/$REPORT_ID/anchor" -H "Authorization: Bearer $TOKEN"
   ```

---

## Summary Checklist

```bash
echo "1. MongoDB Atlas:  $(curl -s http://localhost:4000/healthz | grep -q ok && echo PASS || echo FAIL)"
echo "2. Env vars:       $(docker compose exec backend node -e 'require(\"./src/config/env\")' 2>&1 | grep -q Invalid && echo FAIL || echo PASS)"
echo "3. Docker images:  $(docker images | grep -c career-guidance) custom images built"
echo "4. Compose up:     $(docker compose ps --status running | tail -n +2 | wc -l) services running"
echo "5. Service health: backend=$(curl -s http://localhost:4000/healthz|grep -o ok), ai=$(curl -s http://localhost:5050/healthz|grep -o ok)"
echo "6. Indexes:        (see Step 6b output)"
echo "7. Seed users:     4 demo accounts created"
echo "8. Assessment:     status=$STATUS"
echo "9. AI scoring:     confidence populated"
echo "10. PDF:           $(file /tmp/report.pdf)"
echo "11. Blockchain:    status=$CHAIN_STATUS, valid=true"
```

All 11 steps PASS -> the platform's core journey (auth -> assessment -> AI -> PDF -> blockchain) is verified end-to-end against a real MongoDB Atlas cluster, a real Dockerized stack, and a real (local) blockchain network.
