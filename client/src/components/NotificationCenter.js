import React, { useState, useEffect, useCallback } from 'react';
import { Snackbar, Alert, IconButton, Menu, MenuItem, Badge, Typography, Box } from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Close as CloseIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { jobsAPI } from '../services/api';

const DISMISSED_KEY = 'dismissed_job_errors';
const NOTIFICATIONS_HISTORY_KEY = 'notifications_history';

const NotificationCenter = () => {
  // NOTIFICATIONS TEMPORAIREMENT DÉSACTIVÉES
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

  // Charger l'historique des notifications pour éviter les doublons
  const [notificationsHistory, setNotificationsHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(NOTIFICATIONS_HISTORY_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('Erreur lors du chargement de l\'historique:', error);
      return {};
    }
  });

  // NOTIFICATIONS DÉSACTIVÉES - Fonction commentée
  /*
  const checkJobs = useCallback(async () => {
    try {
      const response = await jobsAPI.getAll();
      const newNotifications = [];
      const currentTime = Date.now();
      
      // Parcourir tous les jobs de toutes les connexions
      Object.entries(response.data).forEach(([connId, jobs]) => {
        jobs.forEach(job => {
          // Si le job a échoué
          if (job.lastRunStatus === 'Échec') {
            // Créer une clé unique plus robuste incluant le message d'erreur
            const errorKey = `${connId}-${job.id}-${job.lastRunDate}-${job.lastRunTime}-${job.lastRunMessage || 'no-message'}`;
            
            // Vérifier si cette erreur spécifique n'a pas déjà été ignorée
            if (!dismissedErrors[errorKey]) {
              // Vérifier si cette notification a déjà été créée récemment (dans les dernières 5 minutes)
              const historyKey = `${connId}-${job.id}`;
              const lastNotificationTime = notificationsHistory[historyKey];
              const timeSinceLastNotification = lastNotificationTime ? currentTime - lastNotificationTime : Infinity;
              
              // Créer une notification seulement si :
              // 1. Aucune notification n'a été créée pour ce job récemment (5 minutes)
              // 2. Ou si le message d'erreur a changé
              const shouldCreateNotification = timeSinceLastNotification > 300000 || // 5 minutes
                !lastNotificationTime ||
                (notificationsHistory[historyKey + '-message'] !== (job.lastRunMessage || 'no-message'));
              
              if (shouldCreateNotification) {
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
                
                // Mettre à jour l'historique
                const updatedHistory = {
                  ...notificationsHistory,
                  [historyKey]: currentTime,
                  [historyKey + '-message']: job.lastRunMessage || 'no-message'
                };
                setNotificationsHistory(updatedHistory);
                
                // Sauvegarder l'historique
                try {
                  localStorage.setItem(NOTIFICATIONS_HISTORY_KEY, JSON.stringify(updatedHistory));
                } catch (error) {
                  console.error('Erreur lors de la sauvegarde de l\'historique:', error);
                }
              }
            }
          }
        });
      });
      
      // Ajouter les nouvelles notifications seulement si elles n'existent pas déjà
      if (newNotifications.length > 0) {
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const uniqueNewNotifications = newNotifications.filter(n => !existingIds.has(n.id));
          return [...uniqueNewNotifications, ...prev];
        });
        
        // Montrer la dernière notification
        setCurrentNotification(newNotifications[0]);
        setShowSnackbar(true);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des jobs:', error);
    }
  }, [dismissedErrors, notificationsHistory]);
  */

  // NOTIFICATIONS DÉSACTIVÉES - Intervalle commenté
  /*
  // Vérifier les jobs toutes les 60 secondes (au lieu de 30) pour réduire les doublons
  useEffect(() => {
    const interval = setInterval(checkJobs, 60000);
    // Vérifier immédiatement au montage
    checkJobs();
    
    return () => clearInterval(interval);
  }, [checkJobs]);
  */

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

  // NOTIFICATIONS DÉSACTIVÉES - Nettoyage commenté
  /*
  // Nettoyer l'historique des anciennes notifications (plus de 24h)
  useEffect(() => {
    const cleanupHistory = () => {
      const currentTime = Date.now();
      const oneDay = 24 * 60 * 60 * 1000; // 24 heures
      
      const cleanedHistory = {};
      Object.entries(notificationsHistory).forEach(([key, timestamp]) => {
        if (currentTime - timestamp < oneDay) {
          cleanedHistory[key] = timestamp;
        }
      });
      
      if (Object.keys(cleanedHistory).length !== Object.keys(notificationsHistory).length) {
        setNotificationsHistory(cleanedHistory);
        try {
          localStorage.setItem(NOTIFICATIONS_HISTORY_KEY, JSON.stringify(cleanedHistory));
        } catch (error) {
          console.error('Erreur lors du nettoyage de l\'historique:', error);
        }
      }
    };
    
    // Nettoyer toutes les heures
    const cleanupInterval = setInterval(cleanupHistory, 60 * 60 * 1000);
    cleanupHistory(); // Nettoyer immédiatement
    
    return () => clearInterval(cleanupInterval);
  }, [notificationsHistory]);
  */

  const unreadCount = notifications.filter(n => !n.read).length;

  // NOTIFICATIONS DÉSACTIVÉES - Retourner null pour cacher l'icône
  return null;

  /*
  return (
    <>
      <IconButton color="inherit" onClick={handleMenuOpen}>
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

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
  */
};

export default NotificationCenter;

