import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
  Alert,
  Paper,
} from '@mui/material';
import { login } from '../api/client.js';

interface Props {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await login(apiKey.trim());
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'pacific-blue',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Paper
        sx={{
          bgcolor: 'midnight-blue',
          p: 5,
          width: '100%',
          maxWidth: 400,
          borderRadius: 2,
        }}
        elevation={6}
      >
        <Typography variant="h5" sx={{ color: 'alabaster', mb: 1, textAlign: 'center' }}>
          🐚 HermitClaw
        </Typography>
        <Typography variant="body2" sx={{ color: 'slate-gray', mb: 4, textAlign: 'center' }}>
          Tide Pool Admin
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            label="Admin API Key"
            type="password"
            fullWidth
            autoFocus
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            variant="outlined"
            sx={{ mb: 3 }}
            inputProps={{ 'aria-label': 'Admin API Key' }}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading || !apiKey.trim()}
            sx={{ bgcolor: 'coral-red', py: 1.5 }}
          >
            {loading ? <CircularProgress size={24} /> : 'Sign In'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
