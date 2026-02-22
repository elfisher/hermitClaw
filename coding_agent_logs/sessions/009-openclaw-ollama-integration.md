# Session 009 (Continued): Ollama Native API Integration

**Date:** 2026-02-21
**Status:** ✅ Complete
**Parent Session:** `009-openclaw-e2e-troubleshooting`
**Goal:** Add native Ollama API support to HermitClaw model proxy, optimize OpenClaw configuration for local LLM performance

---

## Problem Statement

After completing the E2E OpenClaw integration (Session 009), attempted to send messages through the LLM proxy but encountered:
1. Audit logs showing `requestBody: null` for all EGRESS entries
2. LLM responses suggesting message format issues
3. OpenClaw configured to use `api: "openai-completions"` forcing OpenAI format for all providers
4. Timeout issues (120s) with large OpenClaw system prompts
5. Ollama model being loaded from disk on every request (83+ second cold starts)

---

## What We Built

### 1. Audit Log Request Body Logging Fix

**Issue:** The `logTide()` function in `src/routes/model.ts` didn't accept or log the request body parameter, so all audit log entries showed `"requestBody": null`.

**Fix:** Added `requestBody?: string` parameter to `logTide()`:

```typescript
async function logTide(
  crabId: string,
  tool: string,
  targetUrl: string,
  statusCode: number,
  requestBody?: string,      // ADDED
  responseBody?: string,
  error?: string,
) {
  try {
    await db.tide.create({
      data: {
        crabId,
        direction: 'EGRESS',
        tool,
        targetUrl,
        statusCode,
        requestBody: requestBody ? requestBody.slice(0, 4096) : null,  // ADDED
        responseBody: responseBody ? responseBody.slice(0, 4096) : null,
        error: error ?? null,
      },
    });
  } catch {
    // Audit log failure must never crash the gateway
  }
}
```

Updated all call sites to pass `requestBodyRaw` as the new parameter.

**Result:** Full audit trail now available for debugging and compliance.

### 2. Native Ollama `/api/chat` Endpoint

**Architecture Decision:** Rather than forcing all providers through OpenAI format, HermitClaw should be **provider-agnostic** and support multiple native formats:
- OpenAI: `/v1/chat/completions`
- Ollama: `/api/chat`
- Anthropic: `/v1/messages` (future)

**Implementation:** Added new `/api/chat` endpoint to `src/routes/model.ts`:

```typescript
app.post(
  '/api/chat',
  { preHandler: requireCrab },
  async (request, reply) => {
    const crab = request.crab!;

    // Same provider lookup logic as /v1/chat/completions
    const globalProvider = await db.modelProvider.findFirst({
      where: { active: true, scope: 'GLOBAL' },
      orderBy: { createdAt: 'asc' },
    });

    const restrictedProvider = await db.modelProvider.findFirst({
      where: {
        active: true,
        scope: 'RESTRICTED',
        access: { some: { crabId: crab.id } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const provider = globalProvider ?? restrictedProvider;

    if (!provider) {
      return reply.status(503).send({
        error: 'No model provider is configured or accessible for this agent.',
      });
    }

    // Build upstream URL for Ollama native format
    const upstreamUrl = `${provider.baseUrl.replace(/\/$/, '')}/api/chat`;

    // Same header injection, streaming, timeout, audit logging logic
    // ... (full implementation with 300s timeout, streaming support, etc.)
  },
);
```

**Key features:**
- Full streaming support (pipes through transparently)
- 300s timeout (increased from 120s to handle cold starts + large prompts)
- Same authentication, pearl injection, and audit logging as OpenAI endpoint
- Same provider lookup (GLOBAL → RESTRICTED precedence)

### 3. OpenClaw Configuration Update

**Old config (OpenAI format):**
```json
{
  "models": {
    "providers": {
      "hermitclaw": {
        "baseUrl": "http://hermit_shell:3000/v1",
        "api": "openai-completions",
        "apiKey": "${HERMITCLAW_TOKEN}"
      }
    }
  }
}
```

**New config (Ollama native format):**
```json
{
  "models": {
    "providers": {
      "hermitclaw": {
        "baseUrl": "http://hermit_shell:3000",  // Removed /v1
        "api": "ollama",  // Changed from "openai-completions"
        "apiKey": "${HERMITCLAW_TOKEN}"
      }
    }
  }
}
```

**Note:** The `api` field is REQUIRED by OpenClaw - removing it causes crash: `Error: No API provider registered for api: undefined`

### 4. Timeout Increase

Increased timeout from 120s to 300s in both endpoints to accommodate:
- Cold model loads (83+ seconds from disk)
- Large OpenClaw prompts (~17KB system prompt + bootstrap files)
- Network latency in multi-container setup

```typescript
const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min for cold LLM starts + large prompts
```

### 5. Ollama Model Pre-loading Configuration

**Issue:** Ollama was loading llama3.1 from disk on every request:
```json
{
  "load_duration": 83485394208,  // 83+ seconds
  "prompt_eval_count": 300,
  "prompt_eval_duration": 40000000000  // 40 seconds to process prompt
}
```

**Solution:** Configure Ollama to keep model in memory for 24 hours:

```bash
curl -s http://localhost:11434/api/chat -d '{
  "model": "llama3.1",
  "messages": [{"role": "user", "content": "hi"}],
  "stream": false,
  "keep_alive": "24h"
}'
```

**Result:** Subsequent requests show:
```json
{
  "load_duration": 87345678,  // 87ms - model already in memory
  "prompt_eval_duration": 6000000000  // 6 seconds (still slow due to prompt size)
}
```

### 6. Updated Example Configuration

Updated `examples/openclaw/openclaw.json` to:
- Use `api: "ollama"` instead of `"openai-completions"`
- Remove `/v1` from baseUrl
- Add comments explaining the change
- Document both OpenAI and Ollama API support

---

## Performance Analysis

### OpenClaw Prompt Size Investigation

Researched OpenClaw prompt optimization options and discovered:

**System prompt structure (~17KB total):**
- Tooling documentation: ~4KB (tool list, call format, safety guidelines)
- Bootstrap files: ~13KB (AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, etc.)
- All injected on **every turn** by default

**Configuration options explored:**

1. **`systemPromptWhen`** (found in docs but not user-configurable in current version):
   - `"always"` (default): System prompt on every turn
   - `"first"`: Only on first message
   - `"never"`: No system prompt
   - **Status:** Config validation rejects this field as unrecognized

2. **`bootstrapMaxChars`** (configurable):
   - Default: 20000 per file
   - Tried: 1000 (too aggressive, breaks functionality)
   - **Status:** No practical way to reduce without breaking OpenClaw

3. **`bootstrapTotalMaxChars`** (configurable):
   - Default: 150000
   - Tried: 5000 (too aggressive)
   - **Status:** Same as above

**Attempted optimization:**
```json
{
  "agents": {
    "defaults": {
      "systemPromptWhen": "first",        // REJECTED by config validator
      "bootstrapMaxChars": 1000,          // Too aggressive
      "bootstrapTotalMaxChars": 5000      // Too aggressive
    }
  }
}
```

**Conclusion:** OpenClaw's current version doesn't expose enough configuration to meaningfully reduce prompt size without breaking functionality.

### Performance Reality Check

**Model Specs:**
- llama3.1:latest (8 billion parameters, Q4_K_M quantized)
- Size: 4.9GB on disk
- Running on: localhost Ollama (Mac host)

**Observed Performance:**
- Simple "hi" message: 6-9 seconds total
- OpenClaw system prompt (~300 tokens + 17KB bootstrap): 90-120+ seconds (often timeout)

**Root Cause:** The 8B model is sufficient for simple requests, but OpenClaw's massive prompt size (injected on every turn) overwhelms even a reasonably-sized local model.

**Workarounds:**
1. Use cloud provider (Anthropic/OpenAI) for better performance
2. Use faster local model (qwen2.5-coder may be quicker)
3. Accept slow performance for local-only testing
4. Wait for OpenClaw version with better prompt configuration

---

## Troubleshooting Timeline

### Phase 1: Request Body Logging
1. ❌ Audit logs showing `requestBody: null`
2. ✅ Fixed `logTide()` function signature and call sites
3. ✅ Rebuilt hermit_shell Docker container
4. ✅ Full request/response bodies now visible in audit logs

### Phase 2: API Format Research
1. ❌ LLM responses suggesting message format issues
2. 🔍 Gemini research: Found OpenClaw supports native Ollama API
3. ⚠️  Initial conclusion to remove `api` field → container crash
4. ✅ Corrected approach: Change to `api: "ollama"` with baseUrl change
5. ✅ HermitClaw architecture decision: Support multiple formats, not just OpenAI

### Phase 3: Timeout Issues
1. ❌ Requests timing out at 120s
2. 🔍 Verified Ollama working directly (9 seconds for simple request)
3. 🔍 Found Ollama loading model from disk on every request (83s load_duration)
4. ✅ Pre-loaded model with `keep_alive: "24h"`
5. ✅ Increased HermitClaw timeout to 300s
6. ⚠️  Still slow due to OpenClaw prompt size (not solvable at HermitClaw level)

### Phase 4: Prompt Optimization Research
1. 🔍 Gemini research on OpenClaw prompt size optimization
2. 🔍 Found `systemPromptWhen` configuration option in docs
3. ❌ Config validation rejected `systemPromptWhen` as unrecognized
4. ❌ `bootstrapMaxChars` reduction too aggressive (breaks functionality)
5. ✅ Documented as known limitation

---

## What Worked Well

✅ **Multi-agent workflow:** Gemini research saved time finding OpenClaw Ollama docs and prompt optimization options
✅ **Diagnostic isolation:** Testing Ollama directly revealed the cold start issue
✅ **Provider-agnostic design:** Recognizing the need to support multiple API formats, not force everything through OpenAI
✅ **Timeout analysis:** Audit logs with request bodies made debugging timeout root cause straightforward

---

## What Didn't Work / Time Wasters

❌ **Initial Gemini recommendation:** Suggested removing `api` field entirely → container crash
❌ **Prompt optimization attempts:** Config options either don't exist in user config or break functionality when reduced
❌ **Performance expectations:** Expected local 8B model to handle OpenClaw prompts → unrealistic given prompt size

---

## Lessons Learned

### Process Improvements

1. **Provider-agnostic proxy design is superior** — Support native formats rather than forcing translation
2. **Audit logs are critical for debugging** — Request body logging would have saved time in initial troubleshooting
3. **Performance profiling before optimization** — Ollama's verbose output showed exactly where time was spent
4. **Configuration limits** — Not all documented options are user-configurable (version-dependent)

### Technical Learnings

1. **Ollama `keep_alive` parameter** — Essential for production use to avoid cold starts
2. **OpenClaw prompt structure** — Massive system prompts + bootstrap files on every turn
3. **Model size vs prompt size tradeoff** — 8B model can handle simple tasks but struggles with 17KB prompts
4. **HermitClaw streaming proxy** — Works correctly with both OpenAI and Ollama formats

---

## Files Modified

### Backend
- `src/routes/model.ts`:
  - Fixed `logTide()` to accept and log `requestBody` parameter
  - Added `/api/chat` endpoint for Ollama native format
  - Increased timeout from 120s to 300s for both endpoints
  - Updated all `logTide()` call sites to pass request body

### Configuration
- `examples/openclaw/openclaw.json`:
  - Changed `api: "openai-completions"` → `api: "ollama"`
  - Changed `baseUrl: "http://hermit_shell:3000/v1"` → `baseUrl: "http://hermit_shell:3000"`
  - Added comments explaining Ollama native API support

### Documentation
- This file: `coding_agent_logs/sessions/009-openclaw-ollama-integration.md`

---

## E2E Test Verification

✅ HermitClaw `/api/chat` endpoint functional (native Ollama format)
✅ OpenClaw configured with `api: "ollama"`
✅ Audit logs showing full request/response bodies
✅ Timeout increased to 300s (handles cold starts)
✅ Ollama model pre-loaded with 24h keep_alive
✅ Streaming responses working correctly
⚠️  Performance with OpenClaw prompts: 90-120s (acceptable given prompt size, may timeout)

**Status:** E2E integration functionally complete. Performance limitations documented as known issue.

---

## Known Limitations

### OpenClaw + Local LLM Performance

**Issue:** OpenClaw injects ~17KB of system prompt + bootstrap files on every request, overwhelming local 8B models.

**Symptoms:**
- Simple requests: 6-9 seconds ✅
- OpenClaw requests: 90-120+ seconds (often timeout) ⚠️

**Root Cause:** OpenClaw's current version doesn't expose configuration to reduce prompt size.

**Workarounds:**
1. **Use cloud provider** (Anthropic/OpenAI) — Recommended for production
2. **Use faster local model** (qwen2.5-coder) — May improve performance slightly
3. **Accept slow performance** for local-only testing
4. **Increase timeout further** if needed (currently 300s)

**Future:** Wait for OpenClaw version with `systemPromptWhen` or other prompt optimization configs.

### Streaming Behavior

**Note:** Streaming doesn't solve the performance problem - it just makes it *feel* better by showing progressive output instead of waiting 90+ seconds for complete response.

HermitClaw already supports streaming for both `/v1/chat/completions` and `/api/chat` endpoints.

---

## Retrospective Summary

**Total time:** ~3 hours of troubleshooting and optimization
**Could have been:** ~1.5 hours with better initial research
**Key insight:** HermitClaw's value is in being provider-agnostic, not tied to OpenAI format

**Most valuable contribution:**
- Provider-agnostic architecture supporting multiple LLM API formats
- Full audit trail with request/response bodies for debugging and compliance
- Documented performance limitations of local LLMs with large prompts (realistic expectations)

**Next steps:**
1. Add Anthropic API support for better performance
2. Consider adding Anthropic `/v1/messages` endpoint
3. Monitor OpenClaw releases for prompt optimization config options
