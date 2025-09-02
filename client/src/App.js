import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import NotificationCenter from './components/NotificationCenter';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  useTheme,
  useMediaQuery,
  Fab,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Storage as StorageIcon,
  Search as SearchIcon,
  Comment as CommentIcon,
  Storage as DatabaseIcon,
  Build as BuildIcon,
  Schedule as ScheduleIcon,
  DataObject as DataObjectIcon,
  Timer as TimerIcon,
  Note as NoteIcon,
  Add as AddIcon,
  QueryStats as QueryStatsIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

import Connections from './components/Connections';
import Search from './components/Search';
import Comments from './components/Comments';
import Maintenance from './components/Maintenance';
import SqlJobs from './components/SqlJobs';
import Notes from './components/Notes';
import MultiQuery from './components/MultiQuery';
import Settings from './components/Settings';

const drawerWidth = 200;

function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();

  const menuItems = [
    { text: 'Recherche', icon: <SearchIcon />, path: '/' },
    { text: 'Notes', icon: <NoteIcon />, path: '/notes' },
    { text: 'Commentaires', icon: <CommentIcon />, path: '/comments' },
    { text: 'SQL Jobs', icon: <TimerIcon />, path: '/jobs' },
    { text: 'Maintenance', icon: <BuildIcon />, path: '/maintenance' },
    { text: 'Multi-Query', icon: <QueryStatsIcon />, path: '/multi-query' },
    { text: 'Connexions', icon: <StorageIcon />, path: '/connections' },
  ];

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleAddNote = () => {
    // Naviguer vers la page des notes avec un paramètre pour ouvrir le dialogue
    navigate('/notes?action=new');
  };

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar>
        <Box display="flex" alignItems="center" gap={1}>
          <DatabaseIcon />
          <Typography variant="h6" noWrap component="div">
            DB Explorer
          </Typography>
        </Box>
      </Toolbar>
      <List sx={{ flexGrow: 1 }}>
        {menuItems.map((item) => (
          <ListItem
            button
            key={item.text}
            component="a"
            href={item.path}
            onClick={() => isMobile && setMobileOpen(false)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItem>
        ))}
      </List>
      <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
        <ListItem
          button
          component="a"
          href="/settings"
          onClick={() => isMobile && setMobileOpen(false)}
        >
          <ListItemIcon>
            <SettingsIcon />
          </ListItemIcon>
          <ListItemText primary="Paramètres" />
        </ListItem>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Documentation de Bases de Données
          </Typography>
          <NotificationCenter />
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/comments" element={<Comments />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/jobs" element={<SqlJobs />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/multi-query" element={<MultiQuery />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>

        {/* Bouton flottant global pour ajouter une note */}
        <Tooltip title="Ajouter une note" placement="left">
          <Fab
            color="primary"
            sx={{
              position: 'fixed',
              bottom: 32,
              right: 32,
              zIndex: (theme) => theme.zIndex.drawer + 2,
            }}
            onClick={handleAddNote}
          >
            <AddIcon />
          </Fab>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default App;