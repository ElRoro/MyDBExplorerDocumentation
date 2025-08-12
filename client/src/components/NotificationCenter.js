import React, { useState, useEffect, useCallback } from 'react';
import { Snackbar, Alert, IconButton, Menu, MenuItem, Badge, Typography, Box } from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Close as CloseIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { jobsAPI } from '../services/api';

const DISMISSED_KEY = 'dismissed_job_errors';

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  
  // Charger les erreurs ignorées depuis le localStorage
  const [dismissedErrors, setDismissedErrors] = useState(() => {
    try {
      const saved = localStorage.getItem(DISMISSED_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('Erreur lors du chargement des erreurs ignorées:', error);
      return {};
    }
  });

  const checkJobs = useCallback(async () => {
    try {
      const response = await jobsAPI.getAll();
      const newNotifications = [];
      
      // Parcourir tous les jobs de toutes les connexions
      Object.entries(response.data).forEach(([connId, jobs]) => {
        jobs.forEach(job => {
          // Si le job a échoué
          if (job.lastRunStatus === 'Échec') {
            const errorKey = `${connId}-${job.id}-${job.lastRunDate}-${job.lastRunTime}`;
            
            // Vérifier si cette erreur spécifique n'a pas déjà été ignorée
            if (!dismissedErrors[errorKey]) {
              newNotifications.push({
                id: errorKey,
                jobId: job.id,
                connectionId: connId,
                jobName: job.name,
                status: job.lastRunStatus,
                time: new Date().toLocaleString(),
                message: `Le job "${job.name}" a échoué${job.lastRunMessage ? ': ' + job.lastRunMessage : ''}`,
                read: false,
                runDate: job.lastRunDate,
                runTime: job.lastRunTime
              });
            }
          }
        });
      });
      
      // Ajouter les nouvelles notifications
      if (newNotifications.length > 0) {
        setNotifications(prev => [...newNotifications, ...prev]);
        // Montrer la dernière notification
        setCurrentNotification(newNotifications[0]);
        setShowSnackbar(true);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des jobs:', error);
    }
  }, [dismissedErrors]);

  // Vérifier les jobs toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(checkJobs, 30000);
    // Vérifier immédiatement au montage
    checkJobs();
    
    return () => clearInterval(interval);
  }, [checkJobs]);

  const handleMenuOpen = (event) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  // Sauvegarder les erreurs ignorées dans le localStorage
  const saveDismissedErrors = useCallback((errors) => {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(errors));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des erreurs ignorées:', error);
    }
  }, []);

  const handleNotificationRead = (notification) => {
    // Ajouter l'erreur à la liste des erreurs ignorées
    const updatedDismissed = {
      ...dismissedErrors,
      [notification.id]: true
    };
    setDismissedErrors(updatedDismissed);
    saveDismissedErrors(updatedDismissed);

    // Supprimer la notification de la liste
    setNotifications(prev => prev.filter(n => n.id !== notification.id));
  };

  const handleClearAll = () => {
    // Ajouter toutes les notifications actuelles à la liste des ignorées
    const updatedDismissed = { ...dismissedErrors };
    notifications.forEach(notification => {
      updatedDismissed[notification.id] = true;
    });
    
    setDismissedErrors(updatedDismissed);
    saveDismissedErrors(updatedDismissed);
    
    setNotifications([]);
    setMenuAnchor(null);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      {/* Icône de notification avec badge */}
      <IconButton color="inherit" onClick={handleMenuOpen}>
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      {/* Menu des notifications */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            maxHeight: 400,
            width: '400px',
          },
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6" component="div" sx={{ mb: 1 }}>
            Notifications
          </Typography>
          {notifications.length > 0 && (
            <Typography
              variant="body2"
              component="div"
              sx={{ cursor: 'pointer', color: 'primary.main' }}
              onClick={handleClearAll}
            >
              Tout effacer
            </Typography>
          )}
        </Box>
        {notifications.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2">Aucune notification</Typography>
          </MenuItem>
        ) : (
          notifications.map(notification => (
            <MenuItem
              key={notification.id}
              onClick={() => handleNotificationRead(notification)}
              sx={{
                backgroundColor: notification.read ? 'inherit' : 'action.hover',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                <ErrorIcon color="error" sx={{ mr: 1, mt: 0.5 }} />
                <Box>
                  <Typography variant="subtitle2">{notification.message}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {notification.time}
                  </Typography>
                </Box>
              </Box>
            </MenuItem>
          ))
        )}
      </Menu>

      {/* Snackbar pour les nouvelles notifications */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={6000}
        onClose={() => setShowSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity="error"
          action={
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={() => setShowSnackbar(false)}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        >
          {currentNotification?.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default NotificationCenter;

