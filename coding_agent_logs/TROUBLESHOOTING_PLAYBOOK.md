# Troubleshooting Playbook

> Lessons learned from OpenClaw E2E integration (Session 009)

---

## Golden Rules

### 1. Search First, Debug Second
**❌ What we did:** Guessed at config values, tried multiple auth modes blindly
**✅ What to do:** Search for the exact error message immediately
- Copy full error: `"1008: pairing required"`
- Add context: `"openclaw docker 1008 pairing required"`
- Check: GitHub issues, docs, Stack Overflow, community forums

**Example:**
```bash
# Before spending 30 minutes trying different configs:
# Search: "openclaw 1008 pairing required docker"
# Result: Community-documented solution in < 5 minutes
```

---

### 2. Isolate Early
**❌ What we did:** Tried to debug through the full stack (proxy + network + auth)
**✅ What to do:** Test components standalone first

**Isolation checklist:**
1. **Minimal viable**: Can the service run standalone? (`-p` port, no network, no proxy)
2. **Network layer**: Does it work on the Docker network? (add `--network`, still no proxy)
3. **Proxy layer**: Does it work through the proxy? (add proxy env vars)
4. **Integration layer**: Does it work end-to-end with all security layers?

**Example:**
```bash
# Step 1: Minimal (proves service is healthy)
docker run -d --name test -p 18789:18789 -v ~/.openclaw:/home/node/.openclaw openclaw:local

# Step 2: Network (proves DNS resolution works)
docker run -d --name test --network hermitclaw_sand_bed -v ~/.openclaw:/home/node/.openclaw openclaw:local

# Step 3: Proxy (proves HTTP_PROXY doesn't break the service)
docker run -d --name test --network hermitclaw_sand_bed \
  -e HTTP_PROXY=http://hermit_shell:3000 \
  -v ~/.openclaw:/home/node/.openclaw openclaw:local

# Step 4: Full integration
# (add auth tokens, check logs, test E2E)
```

---

### 3. Use Agents for Unknown Systems
**❌ What we did:** Manually read docs, trial-and-error with configs
**✅ What to do:** Delegate research to specialized agents

**When to use Task agent:**
- Unfamiliar error codes
- Third-party system integration
- Multiple docs/sources to cross-reference
- Need to understand a system's architecture before debugging

**Example prompt:**
```
Task: Research OpenClaw's device pairing authentication model

Context: Getting "1008: pairing required" error when connecting to OpenClaw
gateway from Docker container on macOS. Gateway config has password auth
enabled. Need to understand:
1. What is device pairing vs token/password auth?
2. Why would Docker NAT trigger pairing requirements?
3. How to bypass or automate device pairing for trusted connections?

Search OpenClaw docs, GitHub issues, and community forums. Return a summary
with exact config changes needed.
```

---

### 4. Check Official Docs for Config Enums
**❌ What we did:** Tried `bind: "all"` without checking valid values
**✅ What to do:** Look up the schema/enum before guessing

**For any config file:**
1. Find the config reference docs (e.g., `https://docs.openclaw.ai/gateway/configuration-reference.md`)
2. Search for the field name (`bind`)
3. Check valid enum values (`'loopback' | 'lan' | 'tailnet' | 'custom'`)
4. Use the docs-specified value

---

### 5. Docker: Assume Cache Issues
**❌ What we did:** Rebuilt multiple times, unsure if changes were reflecting
**✅ What to do:** Use `--no-cache` when config/code changes aren't working

**When to rebuild with `--no-cache`:**
- Config file changes aren't reflecting
- Code changes aren't showing up
- Unexpected behavior that "should" be fixed

```bash
# Standard rebuild (uses cache)
docker compose build hermit_shell

# Clean rebuild (no cache)
docker compose build --no-cache hermit_shell

# Nuclear option (clear all build cache)
docker builder prune -af
docker compose build --no-cache
```

---

## Debugging Checklist

### When a container won't start or connect:

1. **Check if it's running:**
   ```bash
   docker ps | grep <name>
   ```

2. **Check logs for errors:**
   ```bash
   docker logs <name> 2>&1 | tail -50
   ```

3. **Check network connectivity:**
   ```bash
   docker exec <name> ping hermit_shell
   docker exec <name> curl http://hermit_shell:3000/health
   ```

4. **Check environment variables:**
   ```bash
   docker exec <name> env | grep -i proxy
   ```

5. **Check config file propagation:**
   ```bash
   docker exec <name> cat /path/to/config.json
   ```

6. **Check port mapping:**
   ```bash
   docker port <name>
   # Should show: 18789/tcp -> 0.0.0.0:18789
   ```

---

## Pattern: WebSocket Connection Failures

### Symptoms
- Connection closes immediately
- Error codes: 1006 (abnormal), 1008 (policy violation), 1011 (server error)

### Debug steps

1. **Check origin/host headers:**
   ```javascript
   // In browser console:
   new WebSocket('ws://localhost:3000/agents/openclaw/').addEventListener('open', () => {
     console.log('Connection opened');
   });
   ```

2. **Check server logs for reason:**
   ```bash
   docker logs <container> 2>&1 | grep -i "ws\|websocket\|closed"
   ```

3. **Test direct connection (bypass proxy):**
   ```javascript
   // Connect directly to container (if port exposed)
   new WebSocket('ws://localhost:18789/')
   ```

4. **Check auth requirements:**
   - Does the WebSocket handshake require auth headers?
   - Is there a session cookie requirement?
   - Is there a separate device/client approval step?

---

## Pattern: Proxy Not Working

### HTTP proxy

**Check if traffic is flowing:**
```bash
# In HermitClaw logs, should see CONNECT requests:
docker logs hermit_shell 2>&1 | grep CONNECT
```

**Verify proxy env vars are set:**
```bash
docker exec openclaw env | grep PROXY
# Should show:
# HTTP_PROXY=http://hermit_shell:3000
# HTTPS_PROXY=http://hermit_shell:3000
# NO_PROXY=hermit_shell
```

**Test proxy from inside container:**
```bash
docker exec openclaw curl -v --proxy http://hermit_shell:3000 https://api.anthropic.com
```

### UI reverse proxy

**Check agent name matches container name:**
```typescript
// In agent-ui.ts:
const targetHost = name; // Docker container name == sand_bed hostname
```

**Check uiPort is set:**
```bash
# In Tide Pool → Agents, should see "Open UI" button
# In DB:
docker exec hermit_shell npx prisma studio
# Check Crab table, uiPort column should have value
```

**Check bind address accepts external connections:**
```json
// In openclaw.json:
"gateway": {
  "bind": "lan"  // NOT "loopback" for proxy access
}
```

---

## Anti-Patterns to Avoid

### ❌ Changing multiple things at once
**Problem:** Can't tell which change fixed (or broke) it
**Solution:** Change one variable, test, repeat

### ❌ Assuming error messages are accurate
**Problem:** "pairing required" could mean multiple things
**Solution:** Search for the error in context of the specific system

### ❌ Not reading logs before trying fixes
**Problem:** Waste time fixing the wrong thing
**Solution:** Always check logs first — they often have the exact answer

### ❌ Skipping the "does it work standalone?" test
**Problem:** Debug integration issues when the service itself is broken
**Solution:** Always test the service in isolation first

### ❌ Not documenting the solution
**Problem:** Same issue comes up later, have to debug again
**Solution:** Write session logs, update troubleshooting playbooks

---

## Tools & Commands Reference

### Quick health checks
```bash
# Is the service up?
curl http://localhost:3000/health

# Can containers reach each other?
docker exec openclaw curl http://hermit_shell:3000/health

# Is the DB responding?
docker exec hermit_db pg_isready -U hermit

# Are logs showing errors?
docker logs hermit_shell 2>&1 | grep -i error | tail -20
```

### Network debugging
```bash
# What network is this container on?
docker inspect openclaw | grep Networks -A 10

# Can I resolve the hostname?
docker exec openclaw nslookup hermit_shell

# Is the port open?
docker exec openclaw nc -zv hermit_shell 3000
```

### Docker cleanup
```bash
# Remove stale containers
docker ps -a | grep Exited | awk '{print $1}' | xargs docker rm

# Clear build cache
docker builder prune -af

# Nuclear: remove everything
docker system prune -af --volumes
```

---

## Success Metrics

**Good troubleshooting session:**
- ✅ Issue isolated in < 15 minutes
- ✅ Root cause identified via logs/docs, not guessing
- ✅ Solution documented for next time
- ✅ Lessons learned captured

**Red flags:**
- ❌ Spending > 30 min without checking logs
- ❌ Trying > 3 config changes without searching
- ❌ Rebuilding Docker images without `--no-cache`
- ❌ Not testing standalone before integrating

---

## When to Escalate / Ask for Help

**Ask for help when:**
- Logs show no errors but behavior is wrong
- Error message is cryptic with no search results
- Issue persists after isolating to minimal test case
- Security implications are unclear

**Where to ask:**
- GitHub issues (for the specific project)
- Discord/Slack (project communities)
- Stack Overflow (with full error context)
- Claude Code (research task or debugging session)

---

## Checklist: Before Starting Integration Work

- [ ] Read the official docs for the system you're integrating
- [ ] Search for "docker deployment" or "docker-compose setup" in their docs
- [ ] Look for known issues with Docker on your platform (Mac/Windows/Linux)
- [ ] Test the service standalone before adding security layers
- [ ] Check if there are official Docker images or build from source
- [ ] Review authentication requirements (token vs password vs session vs device)
- [ ] Understand their network requirements (bind addresses, port exposure)

---

## Retrospective Template

After each troubleshooting session, fill this out:

**Issue:**
(one-sentence description)

**Time spent:**
(how long from first error to solution)

**What worked:**
- (list)

**What didn't work / time wasters:**
- (list)

**Root cause:**
(technical explanation)

**Solution:**
(exact config/code change)

**Lessons learned:**
- (process improvements)
- (technical insights)

**Prevention:**
(what could we do to avoid this in future?)

---

## Apply These to Session 009

**What we should have done:**
1. ⏱️ **Minute 1:** Search "openclaw 1008 pairing required docker" → find community docs
2. ⏱️ **Minute 5:** Test OpenClaw standalone (`-p 18789:18789`, no network) → proves it works
3. ⏱️ **Minute 10:** Add `allowInsecureAuth: true` per docs → connection works
4. ⏱️ **Minute 15:** Test on `sand_bed` network with proxy → E2E working
5. ⏱️ **Minute 20:** Document the solution

**Total:** 20 minutes instead of 4 hours

**Takeaway:** Research + isolation + documentation = 12x faster resolution
