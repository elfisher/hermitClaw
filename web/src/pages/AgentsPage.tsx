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

      {newToken && (
        <Alert severity="success" sx={{ mb: 4 }} onClose={() => setNewToken(null)}>
          <Typography variant="body2">
            Agent "{newToken.name}" registered. Copy this token — it won't be shown again.
          </Typography>
          <Box sx={{ p: 1, my: 1, bgcolor: 'rgba(255, 255, 255, 0.1)', borderRadius: 1 }}>
            <Typography sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {newToken.token}
            </Typography>
          </Box>
        </Alert>
      )}

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
                <TableCell align="right">
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
