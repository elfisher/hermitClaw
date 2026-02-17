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
  Tooltip,
} from '@mui/material';
import { getProviders, createProvider, deleteProvider } from '../api/client.js';
import type { ModelProvider } from '../api/types.js';

interface FormState {
  name: string;
  baseUrl: string;
  protocol: 'OPENAI' | 'ANTHROPIC';
  pearlService: string;
  scope: 'GLOBAL' | 'RESTRICTED';
}

const EMPTY_FORM: FormState = {
  name: '',
  baseUrl: '',
  protocol: 'OPENAI',
  pearlService: '',
  scope: 'GLOBAL',
};

export function ProvidersPage() {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<ModelProvider | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProviders(await getProviders());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.baseUrl.trim()) return;
    setSaving(true);
    try {
      await createProvider({
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        protocol: form.protocol,
        pearlService: form.pearlService.trim() || undefined,
        scope: form.scope,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create provider');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteProvider(toDelete.id);
      setToDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete provider');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ color: 'alabaster' }}>Model Providers</Typography>
          <Typography variant="body2" sx={{ color: 'slate-gray', mt: 0.5 }}>
            Configure LLM backends. Agents call <code>/v1/chat/completions</code> — HermitClaw routes to the provider.
          </Typography>
        </Box>
        <Button
          variant="contained"
          sx={{ bgcolor: 'coral-red' }}
          onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
        >
          + Add Provider
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 4 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : providers.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography sx={{ color: 'slate-gray' }}>No providers configured.</Typography>
          <Typography sx={{ color: 'slate-gray', mt: 1 }}>
            Add Ollama (local) or a cloud provider to get started.
          </Typography>
        </Box>
      ) : (
        <Table sx={{ bgcolor: 'midnight-blue', color: 'alabaster' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'slate-gray' }}>Name</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Base URL</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Protocol</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Scope</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>API Key Secret</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Status</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell sx={{ color: 'alabaster', fontFamily: 'Roboto Mono' }}>{p.name}</TableCell>
                <TableCell sx={{ color: 'slate-gray', fontFamily: 'Roboto Mono', fontSize: 12 }}>
                  {p.baseUrl}
                </TableCell>
                <TableCell>
                  <Chip
                    label={p.protocol}
                    size="small"
                    sx={{ fontFamily: 'Roboto Mono', fontSize: 11 }}
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title={p.scope === 'GLOBAL' ? 'Any agent can use this provider' : 'Only explicitly granted agents'}>
                    <Chip
                      label={p.scope}
                      size="small"
                      color={p.scope === 'GLOBAL' ? 'success' : 'warning'}
                      variant="outlined"
                    />
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ color: 'slate-gray', fontFamily: 'Roboto Mono', fontSize: 12 }}>
                  {p.pearlService ?? <em>none (no auth)</em>}
                </TableCell>
                <TableCell>
                  <Chip
                    label={p.active ? 'active' : 'inactive'}
                    size="small"
                    color={p.active ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => setToDelete(p)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add Provider Dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Model Provider</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Configure an LLM backend. For local Ollama, use{' '}
            <code>http://host.docker.internal:11434</code> as the base URL (no API key needed).
          </DialogContentText>

          <TextField
            autoFocus
            margin="dense"
            label="Name"
            placeholder="e.g. ollama-local, openai"
            type="text"
            fullWidth
            variant="outlined"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <TextField
            margin="dense"
            label="Base URL"
            placeholder="http://host.docker.internal:11434"
            type="url"
            fullWidth
            variant="outlined"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          />

          <FormControl fullWidth margin="dense">
            <InputLabel>Protocol</InputLabel>
            <Select
              value={form.protocol}
              label="Protocol"
              onChange={(e) => setForm({ ...form, protocol: e.target.value as 'OPENAI' | 'ANTHROPIC' })}
            >
              <MenuItem value="OPENAI">OpenAI-compatible (Ollama, OpenAI, most providers)</MenuItem>
              <MenuItem value="ANTHROPIC">Anthropic (future)</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth margin="dense">
            <InputLabel>Scope</InputLabel>
            <Select
              value={form.scope}
              label="Scope"
              onChange={(e) => setForm({ ...form, scope: e.target.value as 'GLOBAL' | 'RESTRICTED' })}
            >
              <MenuItem value="GLOBAL">Global — any agent can use this provider</MenuItem>
              <MenuItem value="RESTRICTED">Restricted — only explicitly granted agents</MenuItem>
            </Select>
          </FormControl>

          <TextField
            margin="dense"
            label="API Key Secret Name (optional)"
            placeholder="e.g. openai-key (leave blank for Ollama)"
            type="text"
            fullWidth
            variant="outlined"
            helperText="If set, HermitClaw will look up this pearl service name and inject it as a Bearer token."
            value={form.pearlService}
            onChange={(e) => setForm({ ...form, pearlService: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowForm(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.baseUrl.trim()}
            variant="contained"
          >
            {saving ? <CircularProgress size={24} /> : 'Add Provider'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!toDelete} onClose={() => setToDelete(null)}>
        <DialogTitle>Delete Provider?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete provider "{toDelete?.name}"? Agents using this provider
            will lose model access immediately.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
