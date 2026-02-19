import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
} from '@mui/material';
import { getSettings, updateSetting } from '../api/client.js';

interface SettingMeta {
  key: string;
  label: string;
  description: string;
  type: 'select';
  options: { value: string; label: string }[];
}

// Known settings with display metadata
const KNOWN_SETTINGS: SettingMeta[] = [
  {
    key: 'connect_proxy_default',
    label: 'Default Proxy Policy',
    description:
      'Fallback action when no ConnectRule matches an outbound domain. ' +
      'DENY enables allowlist mode (safer). ALLOW enables denylist mode (more permissive).',
    type: 'select',
    options: [
      { value: 'ALLOW', label: 'ALLOW — permit unmatched domains (denylist mode)' },
      { value: 'DENY', label: 'DENY — block unmatched domains (allowlist mode)' },
    ],
  },
  {
    key: 'session_cookie_ttl_hours',
    label: 'Session Cookie TTL',
    description: 'Lifetime in hours for admin session cookies.',
    type: 'select',
    options: [
      { value: '1', label: '1 hour' },
      { value: '4', label: '4 hours' },
      { value: '8', label: '8 hours (default)' },
      { value: '24', label: '24 hours' },
      { value: '72', label: '72 hours' },
    ],
  },
  {
    key: 'audit_log_retention_days',
    label: 'Audit Log Retention',
    description:
      'How long to keep audit log entries. Entries older than the selected period are deleted ' +
      'automatically once per day. Set to "Forever" to disable pruning.',
    type: 'select',
    options: [
      { value: '0', label: 'Forever (no pruning)' },
      { value: '7', label: '7 days' },
      { value: '30', label: '30 days' },
      { value: '90', label: '90 days' },
      { value: '365', label: '1 year' },
    ],
  },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getSettings();
      setSettings(s);
      setPending(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (key: string) => {
    const value = pending[key];
    if (value === settings[key]) return;
    setSaving(key);
    try {
      await updateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to save ${key}`);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ color: 'alabaster' }}>Settings</Typography>
        <Typography variant="body2" sx={{ color: 'slate-gray', mt: 0.5 }}>
          Global system configuration for the Hermit Shell.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ bgcolor: 'midnight-blue', p: 0 }}>
        {KNOWN_SETTINGS.map((meta, idx) => (
          <Box key={meta.key}>
            {idx > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />}
            <Box sx={{ p: 3, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              {/* Description */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ color: 'alabaster', fontWeight: 600 }}>
                  {meta.label}
                </Typography>
                <Typography variant="body2" sx={{ color: 'slate-gray', mt: 0.5, maxWidth: 500 }}>
                  {meta.description}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'slate-gray', fontFamily: 'Roboto Mono', opacity: 0.6, mt: 0.5, display: 'block' }}
                >
                  key: {meta.key}
                </Typography>
              </Box>

              {/* Control + Save */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <FormControl size="small" sx={{ minWidth: 260 }}>
                  <InputLabel sx={{ color: 'slate-gray' }}>Value</InputLabel>
                  <Select
                    value={pending[meta.key] ?? ''}
                    label="Value"
                    onChange={(e) =>
                      setPending((prev) => ({ ...prev, [meta.key]: e.target.value }))
                    }
                    sx={{ color: 'alabaster' }}
                  >
                    {meta.options.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  variant="contained"
                  size="small"
                  disabled={saving === meta.key || pending[meta.key] === settings[meta.key]}
                  onClick={() => handleSave(meta.key)}
                  sx={{
                    bgcolor: saved === meta.key ? 'success.dark' : 'coral-red',
                    minWidth: 72,
                  }}
                >
                  {saving === meta.key ? (
                    <CircularProgress size={18} />
                  ) : saved === meta.key ? (
                    'Saved!'
                  ) : (
                    'Save'
                  )}
                </Button>
              </Box>
            </Box>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
