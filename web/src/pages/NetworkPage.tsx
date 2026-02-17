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
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Paper,
} from '@mui/material';
import { getConnectRules, createConnectRule, deleteConnectRule, getSettings, updateSetting } from '../api/client.js';
import type { ConnectRule } from '../api/types.js';

interface FormState {
  domain: string;
  action: 'ALLOW' | 'DENY';
  crabId: string;
  priority: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  domain: '',
  action: 'ALLOW',
  crabId: '',
  priority: '100',
  note: '',
};

export function NetworkPage() {
  const [rules, setRules] = useState<ConnectRule[]>([]);
  const [defaultPolicy, setDefaultPolicy] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [updatingDefault, setUpdatingDefault] = useState(false);
  const [toDelete, setToDelete] = useState<ConnectRule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedRules, settings] = await Promise.all([getConnectRules(), getSettings()]);
      setRules(fetchedRules);
      const policy = settings['connect_proxy_default'];
      if (policy === 'ALLOW' || policy === 'DENY') setDefaultPolicy(policy);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load network rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDefaultChange = async (_: React.MouseEvent, value: 'ALLOW' | 'DENY' | null) => {
    if (!value || value === defaultPolicy) return;
    setUpdatingDefault(true);
    try {
      await updateSetting('connect_proxy_default', value);
      setDefaultPolicy(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update default policy');
    } finally {
      setUpdatingDefault(false);
    }
  };

  const handleSave = async () => {
    if (!form.domain.trim()) return;
    const priority = parseInt(form.priority, 10);
    if (isNaN(priority) || priority < 0) {
      setError('Priority must be a non-negative integer');
      return;
    }
    setSaving(true);
    try {
      await createConnectRule({
        domain: form.domain.trim(),
        action: form.action,
        crabId: form.crabId.trim() || undefined,
        priority,
        note: form.note.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteConnectRule(toDelete.id);
      setToDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete rule');
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ color: 'alabaster' }}>Network Rules</Typography>
          <Typography variant="body2" sx={{ color: 'slate-gray', mt: 0.5 }}>
            Control which domains agents can reach via the Hermit Shell HTTP CONNECT proxy.
            Rules are evaluated in priority order (lower number = higher priority).
          </Typography>
        </Box>
        <Button
          variant="contained"
          sx={{ bgcolor: 'coral-red', flexShrink: 0, ml: 2 }}
          onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
        >
          + Add Rule
        </Button>
      </Box>

      {/* Default Policy Banner */}
      <Paper
        sx={{
          p: 2,
          mb: 3,
          bgcolor: 'midnight-blue',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          border: '1px solid',
          borderColor: defaultPolicy === 'DENY' ? 'error.dark' : 'success.dark',
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ color: 'alabaster', fontWeight: 600 }}>
            Default Policy
          </Typography>
          <Typography variant="body2" sx={{ color: 'slate-gray' }}>
            Applied when no rule matches a domain.{' '}
            {defaultPolicy === 'DENY'
              ? 'All unmatched traffic is blocked (allowlist mode).'
              : 'All unmatched traffic is allowed (denylist mode).'}
          </Typography>
        </Box>
        <ToggleButtonGroup
          value={defaultPolicy}
          exclusive
          onChange={handleDefaultChange}
          disabled={updatingDefault}
          size="small"
        >
          <ToggleButton
            value="ALLOW"
            sx={{ color: 'alabaster', '&.Mui-selected': { bgcolor: 'success.dark', color: 'white' } }}
          >
            ALLOW
          </ToggleButton>
          <ToggleButton
            value="DENY"
            sx={{ color: 'alabaster', '&.Mui-selected': { bgcolor: 'error.dark', color: 'white' } }}
          >
            DENY
          </ToggleButton>
        </ToggleButtonGroup>
        {updatingDefault && <CircularProgress size={20} />}
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : rules.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography sx={{ color: 'slate-gray' }}>No rules configured.</Typography>
          <Typography sx={{ color: 'slate-gray', mt: 1 }}>
            All traffic is currently subject to the default policy above.
          </Typography>
        </Box>
      ) : (
        <Table sx={{ bgcolor: 'midnight-blue' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'slate-gray' }}>Priority</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Domain Pattern</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Action</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Scope</TableCell>
              <TableCell sx={{ color: 'slate-gray' }}>Note</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id}>
                <TableCell sx={{ color: 'slate-gray', fontFamily: 'Roboto Mono' }}>
                  {r.priority}
                </TableCell>
                <TableCell sx={{ color: 'alabaster', fontFamily: 'Roboto Mono' }}>
                  {r.domain}
                </TableCell>
                <TableCell>
                  <Chip
                    label={r.action}
                    size="small"
                    color={r.action === 'ALLOW' ? 'success' : 'error'}
                    variant="outlined"
                    sx={{ fontFamily: 'Roboto Mono', fontSize: 11 }}
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title={r.crabId ? `Applies to agent: ${r.crabId}` : 'Applies to all agents'}>
                    <Chip
                      label={r.crabId ? 'per-agent' : 'global'}
                      size="small"
                      color={r.crabId ? 'warning' : 'default'}
                      variant="outlined"
                      sx={{ fontFamily: 'Roboto Mono', fontSize: 11 }}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ color: 'slate-gray', fontSize: 12 }}>
                  {r.note ?? <em>—</em>}
                </TableCell>
                <TableCell align="right">
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => setToDelete(r)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add Rule Dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Network Rule</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Rules are evaluated in priority order (lower number wins). Use <code>*</code> to match
            all domains, <code>*.example.com</code> for subdomains, or <code>api.example.com</code>{' '}
            for an exact match.
          </DialogContentText>

          <TextField
            autoFocus
            margin="dense"
            label="Domain Pattern"
            placeholder="e.g. *.openai.com or api.github.com or *"
            fullWidth
            variant="outlined"
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
          />

          <FormControl fullWidth margin="dense">
            <InputLabel>Action</InputLabel>
            <Select
              value={form.action}
              label="Action"
              onChange={(e) => setForm({ ...form, action: e.target.value as 'ALLOW' | 'DENY' })}
            >
              <MenuItem value="ALLOW">ALLOW — permit connections to this domain</MenuItem>
              <MenuItem value="DENY">DENY — block connections to this domain</MenuItem>
            </Select>
          </FormControl>

          <TextField
            margin="dense"
            label="Priority"
            placeholder="100"
            type="number"
            fullWidth
            variant="outlined"
            helperText="Lower number = evaluated first. Default: 100"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          />

          <TextField
            margin="dense"
            label="Agent ID (optional)"
            placeholder="Leave blank for global rule"
            fullWidth
            variant="outlined"
            helperText="If set, this rule only applies to the specified agent."
            value={form.crabId}
            onChange={(e) => setForm({ ...form, crabId: e.target.value })}
          />

          <TextField
            margin="dense"
            label="Note (optional)"
            placeholder="e.g. Allow OpenAI API access"
            fullWidth
            variant="outlined"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowForm(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.domain.trim()}
            variant="contained"
          >
            {saving ? <CircularProgress size={24} /> : 'Add Rule'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!toDelete} onClose={() => setToDelete(null)}>
        <DialogTitle>Delete Rule?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete the {toDelete?.action} rule for <code>{toDelete?.domain}</code>? Traffic to this
            domain will then fall through to lower-priority rules or the default policy.
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
