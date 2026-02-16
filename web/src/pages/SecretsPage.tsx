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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { getAgents, getSecrets, createSecret, deleteSecret } from '../api/client.js';
import type { Crab, Pearl } from '../api/types.js';

export function SecretsPage() {
  const [agents, setAgents] = useState<Crab[]>([]);
  const [selectedCrabId, setSelectedCrabId] = useState<string>('');
  const [secrets, setSecrets] = useState<Pearl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ service: '', plaintext: '', label: '' });
  const [saving, setSaving] = useState(false);
  const [pearlToDelete, setPearlToDelete] = useState<Pearl | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      const data = await getAgents();
      setAgents(data);
      if (data.length > 0 && !selectedCrabId) {
        setSelectedCrabId(data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    }
  }, [selectedCrabId]);

  const loadSecrets = useCallback(async () => {
    if (!selectedCrabId) { setLoading(false); return; }
    setLoading(true);
    try {
      setSecrets(await getSecrets(selectedCrabId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load secrets');
    } finally {
      setLoading(false);
    }
  }, [selectedCrabId]);

  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => { loadSecrets(); }, [loadSecrets]);

  const handleSave = async () => {
    if (!selectedCrabId || !form.service.trim() || !form.plaintext.trim()) return;
    setSaving(true);
    try {
      await createSecret({
        crabId: selectedCrabId,
        service: form.service.trim(),
        plaintext: form.plaintext.trim(),
        label: form.label.trim() || undefined,
      });
      setForm({ service: '', plaintext: '', label: '' });
      setShowForm(false);
      await loadSecrets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save secret');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pearlToDelete) return;
    try {
      await deleteSecret(pearlToDelete.id);
      setPearlToDelete(null);
      await loadSecrets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete secret');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ color: 'alabaster' }}>Secrets</Typography>
        <Button
          variant="contained"
          sx={{ bgcolor: 'coral-red' }}
          onClick={() => setShowForm(true)}
          disabled={!selectedCrabId}
        >
          + Add Secret
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      <FormControl sx={{ mb: 4, minWidth: 240 }}>
        <InputLabel id="agent-select-label" sx={{ color: 'slate-gray' }}>Agent</InputLabel>
        <Select
          labelId="agent-select-label"
          value={selectedCrabId}
          label="Agent"
          onChange={(e) => setSelectedCrabId(e.target.value)}
          sx={{ color: 'alabaster', '.MuiOutlinedInput-notchedOutline': { borderColor: 'slate-gray' } }}
        >
          {agents.map((a) => (
            <MenuItem key={a.id} value={a.id}>{a.name}{!a.active ? ' (revoked)' : ''}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : !selectedCrabId ? (
        <Typography sx={{ color: 'slate-gray', textAlign: 'center', mt: 8 }}>
          Register an agent first.
        </Typography>
      ) : secrets.length === 0 ? (
        <Typography sx={{ color: 'slate-gray', textAlign: 'center', mt: 8 }}>
          No secrets stored for this agent.
        </Typography>
      ) : (
        <Table sx={{ bgcolor: 'midnight-blue', color: 'alabaster' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'slate-gray' }}>Service</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Label</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Value</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Updated</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {secrets.map((pearl) => (
              <TableRow key={pearl.id}>
                <TableCell sx={{ color: 'alabaster', fontFamily: 'Roboto Mono' }}>{pearl.service}</TableCell>
                <TableCell sx={{ color: 'slate-gray' }}>{pearl.label ?? '—'}</TableCell>
                <TableCell>
                  <Chip label="••••••••" size="small" />
                </TableCell>
                <TableCell sx={{ color: 'slate-gray' }}>
                  {new Date(pearl.updatedAt).toLocaleDateString()}
                </TableCell>
                <TableCell align="right">
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => setPearlToDelete(pearl)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add Secret Dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)}>
        <DialogTitle>Add New Secret</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter the details for the new secret. The secret value will be encrypted and stored securely.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Service Name"
            type="text"
            fullWidth
            variant="outlined"
            value={form.service}
            onChange={(e) => setForm({ ...form, service: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Label (optional)"
            type="text"
            fullWidth
            variant="outlined"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Secret Value"
            type="password"
            fullWidth
            variant="outlined"
            value={form.plaintext}
            onChange={(e) => setForm({ ...form, plaintext: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowForm(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.service.trim() || !form.plaintext.trim()}>
            {saving ? <CircularProgress size={24} /> : 'Save Secret'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Secret Confirmation */}
      <Dialog
        open={!!pearlToDelete}
        onClose={() => setPearlToDelete(null)}
      >
        <DialogTitle>Delete Secret?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the secret for "{pearlToDelete?.service}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPearlToDelete(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
