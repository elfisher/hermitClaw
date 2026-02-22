# OpenClaw Device Authentication Strategies

## Current Approach: `allowInsecureAuth`

HermitClaw currently uses `allowInsecureAuth: true` in OpenClaw's gateway config to bypass device pairing. This is the recommended approach for Docker-on-Mac deployments where NAT makes device pairing unreliable.

### Security Model

**Defense layers with `allowInsecureAuth: true`:**
1. ✅ Tide Pool session authentication (hc_session cookie)
2. ✅ OpenClaw gateway password
3. ✅ Network isolation (sand_bed is internal-only)
4. ❌ Device pairing (bypassed)

**What this means:**
- An attacker needs BOTH Tide Pool session + OpenClaw password to connect
- No additional device approval step required
- Convenient for single-user or trusted multi-user deployments
- Acceptable risk for local development and small team setups

---

## Future Enhancement: Automated Device Approval

For deployments requiring stricter security (defense in depth), device approval can be automated.

### Docker/Server Approach

**Implementation:**
```bash
# After user clicks "Connect" in OpenClaw UI, run this command:
docker exec openclaw openclaw devices approve \
  $(docker exec openclaw openclaw devices list --json | jq -r '.[0].id')
```

**Integration flow:**
1. User registers OpenClaw agent in Tide Pool → receives token
2. User starts OpenClaw container and opens the UI
3. User clicks "Connect" in OpenClaw dashboard → pending device request created
4. User clicks "Approve Device" button in Tide Pool
5. Tide Pool backend runs the approval command via Docker exec
6. Device approval persists in `~/.openclaw/` volume

**Requirements:**
- `jq` installed in HermitClaw container
- User must click Connect in OpenClaw UI before clicking Approve in Tide Pool
- Race condition handling for multiple simultaneous approvals

**API endpoint:**
```typescript
// POST /v1/crabs/:id/approve-device
app.post('/v1/crabs/:id/approve-device', { preHandler: [requireAdmin] }, async (req, reply) => {
  const { id } = req.params;
  const crab = await db.crab.findUnique({ where: { id } });
  if (!crab) return reply.status(404).send({ error: 'Agent not found' });

  // Run approval command
  const result = await exec(
    `docker exec ${crab.name} openclaw devices approve $(docker exec ${crab.name} openclaw devices list --json | jq -r '.[0].id')`
  );

  return reply.send({ approved: true, output: result });
});
```

**UI flow:**
- AgentsPage shows "Pending Device Approval" badge if connection fails with 1008
- "Approve Device" button triggers the API call
- Success toast + auto-refresh the page

---

## Electron App Approach

For a future Electron-based HermitClaw manager, device approval is **not recommended** because:
- Single-user context (the person running the app owns the machine)
- If attacker has access to Electron app, they already own the Docker daemon
- Device approval adds friction with no security gain

### Recommended: Auto-Generated Password + Secure Storage

**On first launch:**
```javascript
const { safeStorage } = require('electron');
const crypto = require('crypto');

// Generate strong random password for OpenClaw
const password = crypto.randomBytes(32).toString('hex');

// Store encrypted in Electron's secure storage
const encrypted = safeStorage.encryptString(password);
fs.writeFileSync(app.getPath('userData') + '/openclaw-password.enc', encrypted);

// Write to openclaw.json
const config = JSON.parse(fs.readFileSync('~/.openclaw/openclaw.json'));
config.gateway.auth.password = password;
config.gateway.controlUi.allowInsecureAuth = true;
fs.writeFileSync('~/.openclaw/openclaw.json', JSON.stringify(config, null, 2));
```

**On subsequent launches:**
```javascript
// Decrypt password from secure storage
const encrypted = fs.readFileSync(app.getPath('userData') + '/openclaw-password.enc');
const password = safeStorage.decryptString(encrypted);

// Auto-inject into WebSocket connection
webview.executeJavaScript(`
  connectToGateway('ws://localhost:18789', { password: '${password}' });
`);
```

**Benefits:**
- Single-sign-on UX (no manual password entry)
- Strong password never exposed to user
- Platform-native encryption (Keychain on macOS, Data Protection API on Windows)
- No device approval friction

---

## Comparison

| Approach | Security | UX | Complexity | Use Case |
|----------|----------|-----|------------|----------|
| `allowInsecureAuth` | Good (session + password) | Excellent | Low | Current (Docker-on-Mac) |
| Automated device approval | Better (session + password + device) | Fair (manual step) | Medium | Strict multi-user server |
| Electron auto-password | Good (session + strong password) | Excellent (SSO) | Low | Future Electron app |

---

## Implementation Priority

1. **Current (v1)**: Use `allowInsecureAuth: true` — documented as acceptable tradeoff for Docker-on-Mac
2. **Future (v2)**: Add automated device approval API + UI for teams requiring stricter security
3. **Future (Electron)**: Auto-generated password + secure storage for single-sign-on UX

---

## Security Considerations

### When `allowInsecureAuth` is acceptable:
- Local development
- Single-user deployments
- Trusted team environments
- Docker-on-Mac (NAT breaks device pairing)

### When device approval is required:
- Multi-tenant server deployments
- Untrusted containers on `sand_bed`
- Compliance requirements for audit trails
- Defense-in-depth security posture

### OpenClaw is already isolated:
- Network: `sand_bed` is internal-only (no internet)
- LLM calls: proxied through HermitClaw (logged)
- Egress: HTTP_PROXY enforced (audited)
- UI access: gated by Tide Pool session auth

Adding device approval provides marginal security gain in exchange for significant UX friction. For most deployments, the current approach is appropriate.
