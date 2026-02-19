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
} from '@mui/material';
import { getAgents, createAgent, revokeAgent } from '../api/client.js';
import type { Crab, CrabWithToken } from '../api/types.js';

export function AgentsPage() {
  const [agents, setAgents] = useState<Crab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<CrabWithToken | null>(null);
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

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await createAgent(newName.trim());
      setNewToken(created);
      setTokenCopied(false);
      setNewName('');
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
  };

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
      <Dialog open={!!newToken} maxWidth="sm" fullWidth disableEscapeKeyDown>
        <DialogTitle>Agent Registered — Save Your Token</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Agent <strong>{newToken?.name}</strong> has been registered. Copy the bearer token below —
            it will <strong>not</strong> be shown again.
          </DialogContentText>
          <Box
            sx={{
              p: 2,
              bgcolor: 'rgba(0,0,0,0.35)',
              borderRadius: 1,
              fontFamily: 'Roboto Mono',
              fontSize: 13,
              wordBreak: 'break-all',
              userSelect: 'all',
              cursor: 'text',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {newToken?.token}
          </Box>
          <FormControlLabel
            sx={{ mt: 2 }}
            control={
              <Checkbox
                checked={tokenCopied}
                onChange={(e) => setTokenCopied(e.target.checked)}
              />
            }
            label="I have copied my token"
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
      <Dialog open={showForm} onClose={handleCloseForm}>
        <DialogTitle>Register New Agent</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter a unique name for the new agent. The access token will be shown once upon creation.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Agent Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
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
