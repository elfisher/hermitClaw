# HermitClaw + OpenClaw Integration Guide

This guide connects [OpenClaw](https://openclaw.ai) to HermitClaw so that all of OpenClaw's
LLM calls and outbound traffic are brokered, audited, and policy-controlled by HermitClaw.

---

## What OpenClaw Is

OpenClaw is a personal AI assistant gateway. It bridges messaging channels — WhatsApp,
Telegram, Discord, iMessage, Slack, and more — to AI agents (the "Pi" runtime). Pi can run
code, browse the web, execute bash commands, and automate tasks.

OpenClaw is **powerful and trusting by design**. It requires significant system permissions
to do its job. HermitClaw is the enforcement layer around it.

> **Note:** Bare-metal macOS support was deprecated by OpenClaw in early 2026 due to the
> security risks of required system-level permissions. The recommended deployment is a
> hardened Linux server or Docker container. See the
> [openclaw-ansible](https://github.com/openclaw/openclaw-ansible) installer for a
> production server setup with Tailscale, UFW, and systemd hardening.

---

## Why HermitClaw + OpenClaw

| Without HermitClaw | With HermitClaw |
|---|---|
| OpenClaw calls Anthropic/OpenAI directly | All LLM calls proxied, logged, policy-controlled |
| OpenClaw has unrestricted internet access | Egress filtered by domain rules (allowlist/denylist) |
| No audit trail of what Pi did | Every model call and outbound connection logged |
| No kill switch | Revoke OpenClaw's token instantly from Tide Pool |
| API keys stored in OpenClaw config | Keys stored encrypted in HermitClaw vault; OpenClaw never holds them |

---

## Architecture

```
[WhatsApp / Telegram / Discord]
         │
         ▼
  [OpenClaw gateway]  ──── LLM calls ──▶  hermit_shell:3000/v1/chat/completions
         │  (sand_bed network,            (bearer token auth, full content logged)
         │   no internet)
         │
         └── outbound HTTP/S ──▶  hermit_shell:3000 (CONNECT proxy)
                                  (domain rules enforced, host:port logged)
```

Both paths go through HermitClaw. OpenClaw has no direct internet access.

---

## Prerequisites

- HermitClaw running (`docker compose up -d`)
- OpenClaw installed (see [openclaw.ai/install](https://docs.openclaw.ai/install/docker))
- `ADMIN_API_KEY` in your `.env`

---

## Setup

### Step 1 — Register OpenClaw as an agent

```bash
./scripts/clawbot-add.sh openclaw 18789
```

This:
- Registers OpenClaw as a crab in HermitClaw
- Sets `uiPort=18789` (OpenClaw's dashboard port) so Tide Pool shows an "Open UI" button
- Writes `.clawbots/openclaw.env` with the bearer token and proxy settings

The env file looks like:
```
HERMITCLAW_TOKEN=hc_...         # HermitClaw bearer token
HERMITCLAW_BASE_URL=http://localhost:3000
HTTP_PROXY=http://hermit_shell:3000
HTTPS_PROXY=http://hermit_shell:3000
NO_PROXY=hermit_shell
```

> **Save the token printed to screen** — it is only shown once. The env file also contains it.

---

### Step 2 — Configure OpenClaw to use HermitClaw as its LLM provider

Copy `examples/openclaw/openclaw.json` to (or merge into) `~/.openclaw/openclaw.json`:

```bash
cp examples/openclaw/openclaw.json ~/.openclaw/openclaw.json
```

Edit the `models` array to match the models you have configured in your HermitClaw providers.
For a local Ollama setup, `llama3.1` and `qwen2.5-coder` are common. The model `id` must match
the model tag as Ollama (or your cloud provider) returns it.

**Two tokens are in play — don't confuse them:**

| Token | Where | Purpose |
|---|---|---|
| `HERMITCLAW_TOKEN` | `.clawbots/openclaw.env` | HermitClaw agent auth. OpenClaw uses this as `apiKey` when calling `/v1/chat/completions`. |
| OpenClaw gateway token | `~/.openclaw/.env` | OpenClaw's own admin token for its Control UI. Managed by OpenClaw, unrelated to HermitClaw. |

---

### Step 3 — Start OpenClaw on the HermitClaw network

OpenClaw must join `hermitclaw_sand_bed` so it can reach `hermit_shell` by hostname.

**Option A — docker run:**
```bash
docker run -d \
  --name openclaw \
  --network hermitclaw_sand_bed \
  --env-file .clawbots/openclaw.env \
  -v ~/.openclaw:/home/node/.openclaw \
  openclaw:local
```

**Option B — extend OpenClaw's docker-compose:**

Add an override to OpenClaw's `docker-compose.yml`:
```yaml
services:
  openclaw-gateway:
    networks:
      - hermitclaw_sand_bed
    env_file:
      - /path/to/hermitclaw/.clawbots/openclaw.env

networks:
  hermitclaw_sand_bed:
    external: true
```

---

### Step 4 — Verify

Check HermitClaw can reach OpenClaw's UI:
```
http://localhost:3000/agents/openclaw/
```

Or open Tide Pool → **Agents** → find `openclaw` → click **Open UI**.

Check traffic is flowing by opening Tide Pool → **Audit Log**. Once OpenClaw makes any
LLM call, you should see a `EGRESS` tide entry with `targetUrl` pointing to your provider.

---

## Configuring Network Rules

By default HermitClaw allows all outbound CONNECT tunnels (`connect_proxy_default = ALLOW`).
For production, switch to allowlist mode:

1. Tide Pool → **Settings** → set **Default Proxy Policy** to `DENY`
2. Tide Pool → **Network Rules** → add explicit ALLOW rules for OpenClaw's required domains:

| Domain | Required for |
|---|---|
| `*.whatsapp.net` | WhatsApp channel |
| `*.telegram.org` | Telegram channel |
| `discord.com` | Discord channel |
| `*.anthropic.com` | Anthropic API (if using cloud provider) |
| `*.openai.com` | OpenAI API (if using cloud provider) |

All other outbound connections will be blocked and logged.

---

## Configuring Model Access

OpenClaw will use whichever `ModelProvider` HermitClaw selects. To control access:

- **GLOBAL scope** — any agent (including OpenClaw) can use this provider. Good for local Ollama.
- **RESTRICTED scope** — only explicitly granted agents. Good for expensive cloud providers.

To grant OpenClaw access to a RESTRICTED provider, open Tide Pool → **Providers** → the
provider → **Grant Access** → select `openclaw`.

---

## Server Deployment (Production)

For a production server, the [openclaw-ansible](https://github.com/openclaw/openclaw-ansible)
installer provisions a hardened Linux host with:

- UFW firewall (only SSH + Tailscale open — no direct port exposure)
- Tailscale VPN for remote access to Tide Pool and OpenClaw UI
- Fail2ban SSH protection
- Systemd hardening (`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem`)

Deploy HermitClaw on the same server. Both services share the `sand_bed` Docker network.
Access Tide Pool and OpenClaw UI through your Tailscale address — never expose port 3000
directly to the internet.

---

## Troubleshooting

**OpenClaw can't reach `hermit_shell`:**
- Confirm the container is on `hermitclaw_sand_bed`: `docker inspect openclaw | grep Networks`
- Confirm HermitClaw is running: `curl http://localhost:3000/health`

**LLM calls fail with 401:**
- `HERMITCLAW_TOKEN` in `.clawbots/openclaw.env` must match the token registered in HermitClaw
- Check Tide Pool → **Agents** → the `openclaw` entry shows **Active** (not Revoked)

**Outbound connections blocked:**
- Check Tide Pool → **Settings** → Default Proxy Policy
- In DENY mode, add explicit ALLOW rules in **Network Rules**
- Check **Audit Log** for CONNECT tunnel entries showing `error: blocked`

**OpenClaw UI not loading at `/agents/openclaw/`:**
- Confirm `uiPort=18789` is set on the crab: Tide Pool → Agents → openclaw shows **Open UI** button
- Confirm OpenClaw is running and its dashboard is up on port 18789 inside the container
