import { useState, useEffect } from 'react';
import { Box, Drawer, AppBar, Toolbar, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, CssBaseline, Button, CircularProgress } from '@mui/material';
import { Shield as AgentsIcon, VpnKey as SecretsIcon, History as AuditLogIcon, SmartToy as ProvidersIcon, Router as NetworkIcon, Settings as SettingsIcon, Logout as LogoutIcon } from '@mui/icons-material';
import { AgentsPage } from './pages/AgentsPage.js';
import { SecretsPage } from './pages/SecretsPage.js';
import { AuditLogPage } from './pages/AuditLogPage.js';
import { ProvidersPage } from './pages/ProvidersPage.js';
import { NetworkPage } from './pages/NetworkPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { checkSession, login, logout } from './api/client.js';

type Tab = 'agents' | 'secrets' | 'providers' | 'network' | 'audit' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ReactElement }[] = [
  { id: 'agents', label: 'Agents', icon: <AgentsIcon /> },
  { id: 'secrets', label: 'Secrets', icon: <SecretsIcon /> },
  { id: 'providers', label: 'Providers', icon: <ProvidersIcon /> },
  { id: 'network', label: 'Network Rules', icon: <NetworkIcon /> },
  { id: 'audit', label: 'Audit Log', icon: <AuditLogIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

const drawerWidth = 240;

export default function App() {
  const [tab, setTab] = useState<Tab>('agents');
  // null = loading, false = not logged in, true = logged in
  const [authed, setAuthed] = useState<boolean | null>(null);

  // Check session on mount.
  // In dev: if VITE_ADMIN_API_KEY is baked in, auto-login so the login screen is skipped.
  useEffect(() => {
    const devKey = import.meta.env.VITE_ADMIN_API_KEY as string | undefined;
    checkSession().then(async (ok) => {
      if (ok) { setAuthed(true); return; }
      if (devKey) {
        try { await login(devKey); setAuthed(true); return; } catch {}
      }
      setAuthed(false);
    });
  }, []);

  const handleLogin = () => setAuthed(true);

  const handleLogout = async () => {
    await logout().catch(() => {});
    setAuthed(false);
  };

  // Still checking
  if (authed === null) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', bgcolor: 'pacific-blue' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Not logged in
  if (!authed) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Logged in — main layout
  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: 'midnight-blue' }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" noWrap component="div">
            🐚 HermitClaw
          </Typography>
          <Button
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            sx={{ color: 'slate-gray', textTransform: 'none' }}
            size="small"
          >
            Sign out
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', bgcolor: 'midnight-blue', color: 'alabaster' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {TABS.map(({ id, label, icon }) => (
              <ListItem key={id} disablePadding>
                <ListItemButton selected={tab === id} onClick={() => setTab(id)}>
                  <ListItemIcon sx={{ color: 'alabaster' }}>
                    {icon}
                  </ListItemIcon>
                  <ListItemText primary={label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: 'pacific-blue', minHeight: '100vh' }}>
        <Toolbar />
        {tab === 'agents' && <AgentsPage />}
        {tab === 'secrets' && <SecretsPage />}
        {tab === 'providers' && <ProvidersPage />}
        {tab === 'network' && <NetworkPage />}
        {tab === 'audit' && <AuditLogPage />}
        {tab === 'settings' && <SettingsPage />}
      </Box>
    </Box>
  );
}
