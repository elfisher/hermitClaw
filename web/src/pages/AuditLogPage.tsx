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
  Pagination,
  Alert,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Drawer,
  IconButton,
  Divider,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { getTides, getAgents } from '../api/client.js';
import type { Tide, Pagination as PaginationType, Crab } from '../api/types.js';

const DRAWER_WIDTH = 480;

function tryFormatJson(raw: string | null): string {
  if (!raw) return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function DetailSection({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="caption" sx={{ color: 'slate-gray', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Typography>
      <Box
        sx={{
          mt: 0.5,
          p: 1.5,
          bgcolor: 'rgba(0,0,0,0.3)',
          borderRadius: 1,
          fontFamily: 'Roboto Mono',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          color: 'alabaster',
          maxHeight: 300,
          overflowY: 'auto',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {value}
      </Box>
    </Box>
  );
}

export function AuditLogPage() {
  const [tides, setTides] = useState<Tide[]>([]);
  const [pagination, setPagination] = useState<PaginationType | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Crab[]>([]);
  const [filter, setFilter] = useState({ agentId: '', statusCode: '' });
  const [selected, setSelected] = useState<Tide | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTides({
        page,
        limit: 20,
        crabId: filter.agentId || undefined,
        statusCode: filter.statusCode ? Number(filter.statusCode) : undefined,
      });
      setTides(data.tides);
      setPagination(data.pagination);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  const loadAgents = useCallback(async () => {
    try {
      setAgents(await getAgents());
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadAgents();
    load();
  }, [load, loadAgents]);

  const statusColor = (code: number | null) => {
    if (code === null) return 'default';
    if (code >= 500) return 'error';
    if (code >= 400) return 'warning';
    if (code >= 300) return 'info';
    return 'success';
  };

  return (
    <Box sx={{ display: 'flex', gap: 0 }}>
      {/* Main content */}
      <Box sx={{ flex: 1, minWidth: 0, transition: 'all 0.2s' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4" sx={{ color: 'alabaster' }}>Audit Log</Typography>
          <Button variant="outlined" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 4 }}>
            {error}
          </Alert>
        )}

        {/* Filter Bar */}
        <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="agent-filter-label" sx={{ color: 'slate-gray' }}>Filter by Agent</InputLabel>
            <Select
              labelId="agent-filter-label"
              value={filter.agentId}
              label="Filter by Agent"
              onChange={(e) => setFilter({ ...filter, agentId: e.target.value })}
              sx={{ color: 'alabaster', '.MuiOutlinedInput-notchedOutline': { borderColor: 'slate-gray' } }}
            >
              <MenuItem value=""><em>All Agents</em></MenuItem>
              {agents.map(agent => (
                <MenuItem key={agent.id} value={agent.id}>{agent.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Status Code"
            variant="outlined"
            value={filter.statusCode}
            onChange={(e) => setFilter({ ...filter, statusCode: e.target.value })}
            sx={{
              input: { color: 'alabaster' },
              label: { color: 'slate-gray' },
              '.MuiOutlinedInput-notchedOutline': { borderColor: 'slate-gray' },
            }}
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <CircularProgress />
          </Box>
        ) : tides.length === 0 ? (
          <Typography sx={{ color: 'slate-gray', textAlign: 'center', mt: 8 }}>
            No activity recorded yet.
          </Typography>
        ) : (
          <>
            <Table sx={{ bgcolor: 'midnight-blue', color: 'alabaster' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: 'slate-gray' }}>Time</TableCell>
                  <TableCell sx={{ color: 'slate-gray' }}>Agent</TableCell>
                  <TableCell sx={{ color: 'slate-gray' }}>Direction</TableCell>
                  <TableCell sx={{ color: 'slate-gray' }}>Target</TableCell>
                  <TableCell sx={{ color: 'slate-gray' }}>Status</TableCell>
                  <TableCell sx={{ color: 'slate-gray' }}>Error</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tides.map((tide) => (
                  <TableRow
                    key={tide.id}
                    onClick={() => setSelected(tide)}
                    sx={{
                      cursor: 'pointer',
                      '&:last-child td, &:last-child th': { border: 0 },
                      bgcolor: selected?.id === tide.id ? 'rgba(255,255,255,0.06)' : undefined,
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                    }}
                  >
                    <TableCell sx={{ color: 'slate-gray', whiteSpace: 'nowrap' }}>
                      {new Date(tide.createdAt).toLocaleTimeString()}
                    </TableCell>
                    <TableCell sx={{ color: 'alabaster', fontFamily: 'Roboto Mono' }}>
                      {tide.crab?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Chip label={tide.direction} size="small" />
                    </TableCell>
                    <TableCell sx={{ color: 'alabaster', fontFamily: 'Roboto Mono', maxWidth: selected ? '160px' : '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tide.targetUrl ?? '—'}
                    </TableCell>
                    <TableCell>
                      {tide.statusCode ? (
                        <Chip label={tide.statusCode} color={statusColor(tide.statusCode)} size="small" />
                      ) : '—'}
                    </TableCell>
                    <TableCell sx={{ color: 'crimson-red', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tide.error}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {pagination && pagination.pages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <Pagination
                  count={pagination.pages}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                  sx={{ button: { color: 'alabaster' } }}
                />
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Detail Drawer */}
      <Drawer
        anchor="right"
        open={!!selected}
        onClose={() => setSelected(null)}
        variant="persistent"
        sx={{
          width: selected ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            bgcolor: 'midnight-blue',
            borderLeft: '1px solid rgba(255,255,255,0.1)',
            p: 3,
            pt: 2,
            boxSizing: 'border-box',
            top: 64, // below AppBar
            height: 'calc(100% - 64px)',
          },
        }}
      >
        {selected && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ color: 'alabaster' }}>Request Details</Typography>
              <IconButton onClick={() => setSelected(null)} sx={{ color: 'slate-gray' }}>
                <CloseIcon />
              </IconButton>
            </Box>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 2 }} />

            {/* Metadata */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 3 }}>
              {[
                { label: 'Time', value: new Date(selected.createdAt).toLocaleString() },
                { label: 'Agent', value: selected.crab?.name ?? '—' },
                { label: 'Direction', value: selected.direction },
                { label: 'Status', value: selected.statusCode?.toString() ?? '—' },
                { label: 'Tool', value: selected.tool ?? '—' },
              ].map(({ label, value }) => (
                <Box key={label}>
                  <Typography variant="caption" sx={{ color: 'slate-gray', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    {label}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'alabaster', fontFamily: 'Roboto Mono', mt: 0.25 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>

            <DetailSection label="Target URL" value={selected.targetUrl} />
            <DetailSection label="Request Body" value={tryFormatJson(selected.requestBody)} />
            <DetailSection label="Response Body" value={tryFormatJson(selected.responseBody)} />
            <DetailSection label="Error" value={selected.error} />
          </>
        )}
      </Drawer>
    </Box>
  );
}
