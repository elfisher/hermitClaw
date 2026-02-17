import { useState } from 'react';
import { Box, Drawer, AppBar, Toolbar, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, CssBaseline } from '@mui/material';
import { Shield as AgentsIcon, VpnKey as SecretsIcon, History as AuditLogIcon, SmartToy as ProvidersIcon, Router as NetworkIcon, Settings as SettingsIcon } from '@mui/icons-material';
import { AgentsPage } from './pages/AgentsPage.js';
import { SecretsPage } from './pages/SecretsPage.js';
import { AuditLogPage } from './pages/AuditLogPage.js';
import { ProvidersPage } from './pages/ProvidersPage.js';
import { NetworkPage } from './pages/NetworkPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

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

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: 'midnight-blue' }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            🐚 HermitClaw
          </Typography>
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
