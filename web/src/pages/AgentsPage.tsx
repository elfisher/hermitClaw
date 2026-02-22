import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Alert,
  Checkbox,
  FormControlLabel,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
} from '@mui/material';
import { getAgents, createAgent, revokeAgent } from '../api/client.js';
import type { Crab, CrabWithToken } from '../api/types.js';

type AgentType = 'generic' | 'openclaw';

function buildOpenClawConfig(token: string): string {
  return `{
  agents: {
    defaults: {
      model: { primary: "hermitclaw/llama3.1" },
      models: {
        "hermitclaw/llama3.1": { alias: "Llama 3.1" },
      },
    },
  },
  models: {
    mode: "merge",
    providers: {
      hermitclaw: {
        baseUrl: "http://hermit_shell:3000/v1",
        apiKey: "${token}",
        api: "openai-completions",
        models: [
          {
            id: "llama3.1",
            name: "Llama 3.1 (via HermitClaw)",
            contextWindow: 128000,
            maxTokens: 32000,
          },
        ],
      },
    },
  },
}`;
}

function buildDockerRunCommand(token: string, name: string): string {
  return `docker run -d \\
  --name ${name} \\
  --network hermitclaw_sand_bed \\
  -e HERMITCLAW_TOKEN=${token} \\
  -e HTTP_PROXY=http://hermit_shell:3000 \\
  -e HTTPS_PROXY=http://hermit_shell:3000 \\
  -e NO_PROXY=hermit_shell \\
  -v ~/.openclaw:/home/node/.openclaw \\
  openclaw:local`;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <Box
      sx={{
        p: 1.5,
        bgcolor: 'rgba(0,0,0,0.4)',
        borderRadius: 1,
        fontFamily: 'Roboto Mono, monospace',
        fontSize: 12,
        whiteSpace: 'pre',
        overflowX: 'auto',
        userSelect: 'all',
        cursor: 'text',
        border: '1px solid rgba(255,255,255,0.1)',
        lineHeight: 1.6,
      }}
    >
      {children}
    </Box>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Crab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Registration form state
  const [agentType, setAgentType] = useState<AgentType>('generic');
  const [newName, setNewName] = useState('');
  const [uiPort, setUiPort] = useState('');
  const [creating, setCreating] = useState(false);

  // Token reveal dialog state
  const [newToken, setNewToken] = useState<CrabWithToken | null>(null);
  const [newTokenType, setNewTokenType] = useState<AgentType>('generic');
  const [tokenCopied, setTokenCopied] = useState(false);

  const [agentToRevoke, setAgentToRevoke] = useState<Crab | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setAgents(await getAgents());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAgentTypeChange = (_: React.MouseEvent<HTMLElement>, value: AgentType | null) => {
    if (!value) return;
    setAgentType(value);
    if (value === 'openclaw') {
      setUiPort('18789');
      if (!newName) setNewName('openclaw');
    } else {
      setUiPort('');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const port = uiPort ? parseInt(uiPort, 10) : undefined;
      const created = await createAgent(newName.trim(), port);
      setNewToken(created);
      setNewTokenType(agentType);
      setTokenCopied(false);
      setNewName('');
      setUiPort('');
      setAgentType('generic');
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!agentToRevoke) return;
    try {
      await revokeAgent(agentToRevoke.id);
      setAgentToRevoke(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke agent');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setNewName('');
    setUiPort('');
    setAgentType('generic');
  };

  const isOpenClaw = newTokenType === 'openclaw';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ color: 'alabaster' }}>Agents</Typography>
        <Button variant="contained" sx={{ bgcolor: 'coral-red' }} onClick={() => setShowForm(true)}>
          + Register Agent
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      {/* Token reveal dialog — requires explicit acknowledgment before closing */}
      <Dialog open={!!newToken} maxWidth="md" fullWidth disableEscapeKeyDown>
        <DialogTitle>
          Agent Registered — {isOpenClaw ? 'Save Your Setup Commands' : 'Save Your Token'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Agent <strong>{newToken?.name}</strong> has been registered. Copy the information below —
            the bearer token will <strong>not</strong> be shown again.
          </DialogContentText>

          {/* Bearer token — always shown */}
          <Typography variant="subtitle2" sx={{ color: 'slate-gray', mb: 0.5 }}>
            Bearer Token
          </Typography>
          <CodeBlock>{newToken?.token ?? ''}</CodeBlock>

          {isOpenClaw && newToken && (
            <>
              <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />

              {/* openclaw.json config */}
              <Typography variant="subtitle2" sx={{ color: 'slate-gray', mb: 0.5 }}>
                ~/.openclaw/openclaw.json  (merge or create)
              </Typography>
              <Typography variant="caption" sx={{ color: 'slate-gray', display: 'block', mb: 1 }}>
                Replace model IDs with the models you have configured in HermitClaw &rarr; Providers.
                See <code>examples/openclaw/openclaw.json</code> for the full config with all options.
              </Typography>
              <CodeBlock>{buildOpenClawConfig(newToken.token)}</CodeBlock>

              <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />

              {/* docker run command */}
              <Typography variant="subtitle2" sx={{ color: 'slate-gray', mb: 0.5 }}>
                Start OpenClaw container
              </Typography>
              <Typography variant="caption" sx={{ color: 'slate-gray', display: 'block', mb: 1 }}>
                Run this after writing the config above. OpenClaw must be on{' '}
                <code>hermitclaw_sand_bed</code> to reach <code>hermit_shell</code>.
              </Typography>
              <CodeBlock>{buildDockerRunCommand(newToken.token, newToken.name)}</CodeBlock>

              <Alert severity="info" sx={{ mt: 2, fontSize: 12 }}>
                <strong>Two tokens in play:</strong> <code>HERMITCLAW_TOKEN</code> above is
                HermitClaw's agent auth. OpenClaw also has its own gateway token (in{' '}
                <code>~/.openclaw/.env</code>) — that's unrelated to HermitClaw.
              </Alert>
            </>
          )}

          <FormControlLabel
            sx={{ mt: 2, display: 'block' }}
            control={
              <Checkbox
                checked={tokenCopied}
                onChange={(e) => setTokenCopied(e.target.checked)}
              />
            }
            label={isOpenClaw ? 'I have copied my token and setup commands' : 'I have copied my token'}
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            disabled={!tokenCopied}
            onClick={() => { setNewToken(null); setTokenCopied(false); }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : agents.length === 0 ? (
        <Typography sx={{ color: 'slate-gray', textAlign: 'center', mt: 8 }}>
          No agents registered yet.
        </Typography>
      ) : (
        <Table sx={{ bgcolor: 'midnight-blue', color: 'alabaster' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'slate-gray' }}>Name</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Status</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Registered</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell sx={{ color: 'alabaster', fontFamily: 'Roboto Mono' }}>{agent.name}</TableCell>
                <TableCell>
                  <Chip
                    label={agent.active ? 'Active' : 'Revoked'}
                    color={agent.active ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell sx={{ color: 'slate-gray' }}>
                  {new Date(agent.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell align="right" sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  {agent.active && agent.uiPort && (
                    <Button
                      variant="outlined"
                      size="small"
                      href={`/agents/${agent.name}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ color: 'alabaster', borderColor: 'slate-gray' }}
                    >
                      Open UI
                    </Button>
                  )}
                  {agent.active && (
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => setAgentToRevoke(agent)}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Register Agent Dialog */}
      <Dialog open={showForm} onClose={handleCloseForm} maxWidth="sm" fullWidth>
        <DialogTitle>Register New Agent</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Select an agent type to get started. OpenClaw agents get a pre-filled port and
            ready-to-run setup commands after registration.
          </DialogContentText>

          {/* Agent type selector */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: 'slate-gray', display: 'block', mb: 1 }}>
              Agent Type
            </Typography>
            <ToggleButtonGroup
              value={agentType}
              exclusive
              onChange={handleAgentTypeChange}
              size="small"
              fullWidth
            >
              <ToggleButton value="generic">Generic</ToggleButton>
              <ToggleButton value="openclaw">OpenClaw</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <TextField
            autoFocus
            margin="dense"
            label="Agent Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !uiPort && handleCreate()}
            sx={{ mb: 1 }}
          />

          {/* uiPort field — always visible; pre-filled for OpenClaw */}
          <TextField
            margin="dense"
            label="UI Port (optional)"
            helperText={
              agentType === 'openclaw'
                ? "OpenClaw's dashboard port — enables the 'Open UI' button in Tide Pool"
                : "If the agent exposes a web UI, enter the container port here"
            }
            type="number"
            fullWidth
            variant="outlined"
            value={uiPort}
            onChange={(e) => setUiPort(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseForm}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? <CircularProgress size={24} /> : 'Register'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Revoke Agent Confirmation */}
      <Dialog
        open={!!agentToRevoke}
        onClose={() => setAgentToRevoke(null)}
      >
        <DialogTitle>Revoke Agent Access?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to revoke access for agent "{agentToRevoke?.name}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAgentToRevoke(null)}>Cancel</Button>
          <Button onClick={handleRevoke} color="error">
            Revoke
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
