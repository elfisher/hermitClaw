# 🐚 Project: HermitClaw

> **Tagline:** A Hard Shell for Soft Agents.
> **Status:** Design Phase
> **License:** MIT

## 1. Executive Summary

**HermitClaw** is a self-hosted, secure tool execution gateway and credential vault designed for OpenClaw agents ("Clawbots").

AI Agents are prone to prompt injection and hallucination. They should never hold long-term credentials (API keys) or have unfettered internet access. **HermitClaw** acts as a secure intermediary (The Shell), holding the secrets (The Pearls) and executing tools on behalf of the sandboxed agent (The Crab).

---

## 2. High-Level Architecture

The system enforces a **Zero-Trust Network Architecture** using Docker containers.

### The Mental Model

* **The Crab (Agent):** Lives in a strictly internal network (`sand_bed`). It has **no internet access**. It can only talk to The Shell.
* **The Shell (Gateway):** The only component that bridges the internal network and the outside world (`open_ocean`). It validates requests, injects credentials, and logs activity.
* **The Pearl (Vault):** An encrypted PostgreSQL database accessible *only* by The Shell.
* **The Tide Pool (UI):** A web dashboard for humans to manage secrets and view logs.

### Network Topology Diagram

```mermaid
graph TD
    subgraph "Host Machine"
        subgraph "Network: sand_bed (Internal/No Internet)"
            Crab1[Clawbot: Dev]
            Crab2[Clawbot: Social]
        end

        subgraph "Network: open_ocean (Bridge/Internet)"
            Shell[HermitClaw Gateway]
            DB[(Pearl Vault DB)]
        end
    end

    Crab1 -->|HTTP POST /execute| Shell
    Crab2 -->|HTTP POST /execute| Shell
    Shell -->|SQL| DB
    Shell -->|HTTPS| Github[GitHub API]
    Shell -->|HTTPS| Slack[Slack API]
    External[Signal/WhatsApp] -->|Webhook| Shell
```

---

## 3. Component Specifications

### A. The Shell (Gateway Service)

* **Runtime:** Node.js (TypeScript) + Fastify.
* **Responsibility:**
* **Egress (Tool Use):** Intercepts agent requests, decrypts keys, executes API calls.
* **Ingress (Messaging):** Receives webhooks from chat apps (Signal/WhatsApp) and routes them to the correct Agent container.
* **Audit:** Logs every single request and response to the database.

### B. The Pearl Vault (Database)

* **Runtime:** PostgreSQL 16.
* **Encryption:** All secrets are encrypted at rest using **AES-256-GCM**.
* **Schema:**
* `crabs`: Registered agents and their internal API tokens.
* `pearls`: Encrypted credentials (API keys, OAuth tokens).
* `tides`: Audit logs of all traffic.
* `routes`: Ingress routing rules for incoming messages.

### C. The Tide Pool (Control Panel)

* **Runtime:** React + Vite (Single Page App).
* **Deployment:** Served statically by The Shell container.
* **Features:**
* **Secret Manager:** Add/Update API keys.
* **Live Stream:** Watch agents "thinking" and acting in real-time.
* **Kill Switch:** Instantly revoke an agent's access to The Shell.

---

## 4. Security Core (`crypto.ts`)

This is the foundation of the vault. It ensures that even if the database is dumped, the secrets are useless without the `MASTER_PEARL`.

```typescript
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// CONFIG: MASTER_PEARL passed via ENV (32 bytes hex)
const ALGORITHM = 'aes-256-gcm';
const MASTER_KEY_HEX = process.env.MASTER_PEARL || '';
const MASTER_KEY = Buffer.from(MASTER_KEY_HEX, 'hex');

if (MASTER_KEY.length !== 32) throw new Error('CRITICAL: Invalid MASTER_PEARL');

export interface EncryptedPearl {
  encryptedBlob: string; // hex
  iv: string;            // hex
  authTag: string;       // hex
}

// Encrypts a raw secret (API Key)
export function encryptPearl(text: string): EncryptedPearl {
  const iv = randomBytes(16); // Unique IV per encryption
  const cipher = createCipheriv(ALGORITHM, MASTER_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return { encryptedBlob: encrypted, iv: iv.toString('hex'), authTag };
}

// Decrypts a Pearl back into the raw secret
export function decryptPearl(pearl: EncryptedPearl): string {
  const decipher = createDecipheriv(ALGORITHM, MASTER_KEY, Buffer.from(pearl.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(pearl.authTag, 'hex')); // Anti-tamper check

  let decrypted = decipher.update(pearl.encryptedBlob, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

---

## 5. Ingress & Egress Workflows

### Egress: The "Tool Call"

*How an Agent uses a tool (e.g., GitHub).*

1. **Agent** sends payload to Shell:
```json
POST http://hermit_shell:3000/v1/execute
Headers: { "Authorization": "Bearer agent_token_123" }
Body: { "tool": "github_star", "args": { "repo": "hermit-claw" } }
```

2. **Shell** validates `agent_token_123`.
3. **Shell** looks up the `github` credential for this agent in `pearls` table.
4. **Shell** decrypts the token, constructs the request to `api.github.com`, and executes it.
5. **Shell** sanitizes the response and returns JSON to Agent.

### Ingress: The "Reverse Route"

*How you send a message to a specific bot via Signal/WhatsApp.*

1. **External Trigger:** You send a Signal message: *"@supportbot check server status"*.
2. **Signal Connector:** (A container like `signal-cli-rest-api`) receives the message and webhooks to Shell:
```json
POST http://hermit_shell:3000/v1/ingress/signal
Body: { "message": "@supportbot check server status", "sender": "+15550000" }
```

3. **Shell** checks `routes` table:
   * *Rule:* "If message starts with `@supportbot`, forward to container `claw_support`."

4. **Shell** forwards payload to the Agent's internal web server:
```json
POST http://claw_support:8000/webhook
Body: { "content": "check server status", "user": "+15550000" }
```

---

## 6. Implementation Strategy

### Phase 1: The Core (Skeleton)

* Setup Monorepo (`/server`, `/web`, `/infra`).
* Implement `crypto.ts`.
* Build `POST /v1/execute` stub.

### Phase 2: The Vault (Database)

* Setup PostgreSQL with Prisma ORM.
* Create `pearls` table migration.
* Implement "Add Secret" API.

### Phase 3: The Gateway (Logic)

* Implement the "Injector" (Regex replace placeholders with decrypted keys).
* Add Support for standard Auth types: `Bearer`, `Basic`, `Header`, `QueryParam`.

### Phase 4: The Ingress (Messaging)

* Implement `POST /v1/ingress/:provider`.
* Implement the internal routing logic.

---

## 7. Deployment Configuration (`docker-compose.yml`)

This file is all you need to run HermitClaw alongside a sample Python agent.

```yaml
version: '3.8'

services:
  # --- THE HERMITCLAW INFRASTRUCTURE ---

  # 1. The Shell (Gateway + UI)
  hermit_shell:
    image: hermitclaw/server:latest
    container_name: hermit_shell
    restart: unless-stopped
    ports:
      - "3000:3000" # UI and API
    environment:
      - DATABASE_URL=postgresql://hermit:securepass@hermit_db:5432/hermitclaw
      - MASTER_PEARL=${MASTER_PEARL} # 32-byte hex key from .env
    depends_on:
      - hermit_db
    networks:
      - sand_bed     # To talk to Agents
      - open_ocean   # To talk to Internet & DB

  # 2. The Pearl Vault (DB)
  hermit_db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: hermit
      POSTGRES_PASSWORD: securepass
      POSTGRES_DB: hermitclaw
    volumes:
      - hermit_data:/var/lib/postgresql/data
    networks:
      - open_ocean

  # --- YOUR AGENTS (SANDBOXED) ---

  # 3. Example Agent (Python)
  # This agent CANNOT reach the internet. It acts via the Shell.
  claw_agent_01:
    build: ./examples/python_bot
    container_name: claw_agent_01
    environment:
      - AGENT_NAME=Agent01
      - SHELL_URL=http://hermit_shell:3000
      - SHELL_TOKEN=dev_token_123
    networks:
      - sand_bed # ISOLATED NETWORK
    # Optional Security Hardening:
    # runtime: runsc
    # read_only: true

networks:
  sand_bed:
    internal: true # STRICT ISOLATION: No Internet Access
  open_ocean:
    driver: bridge # Internet Access

volumes:
  hermit_data:
```

## 8. Directory Structure (Repo Map)

```text
hermit-claw/
├── docker-compose.yml       # Production Stack
├── .env.example             # Secrets template
├── src/                     # Gateway Source Code
│   ├── index.ts             # Fastify Entry point
│   ├── routes/
│   │   ├── execute.ts       # Egress Logic
│   │   └── ingress.ts       # Inbound Messaging Logic
│   └── lib/
│       ├── crypto.ts        # Encryption Module
│       └── db.ts            # Prisma Client
├── web/                     # React Dashboard Source
└── examples/                # Community Examples
    └── python_bot/          # Minimal bot using HermitClaw
        ├── Dockerfile
        └── main.py
```
