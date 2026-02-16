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
} from '@mui/material';
import { getTides, getAgents } from '../api/client.js';
import type { Tide, Pagination as PaginationType, Crab } from '../api/types.js';

export function AuditLogPage() {
  const [tides, setTides] = useState<Tide[]>([]);
  const [pagination, setPagination] = useState<PaginationType | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Crab[]>([]);
  const [filter, setFilter] = useState({ agentId: '', statusCode: '' });

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
    } catch (e) {
      // Non-critical, so we don't set a main error
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
    <Box>
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
                <TableRow key={tide.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                  <TableCell sx={{ color: 'slate-gray', whiteSpace: 'nowrap' }}>
                    {new Date(tide.createdAt).toLocaleTimeString()}
                  </TableCell>
                  <TableCell sx={{ color: 'alabaster', fontFamily: 'Roboto Mono' }}>
                    {tide.crab?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Chip label={tide.direction} size="small" />
                  </TableCell>
                  <TableCell sx={{ color: 'alabaster', fontFamily: 'Roboto Mono', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tide.targetUrl ?? '—'}
                  </TableCell>
                  <TableCell>
                    {tide.statusCode ? (
                      <Chip label={tide.statusCode} color={statusColor(tide.statusCode)} size="small" />
                    ) : '—'}
                  </TableCell>
                  <TableCell sx={{ color: 'crimson-red', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
  );
}
