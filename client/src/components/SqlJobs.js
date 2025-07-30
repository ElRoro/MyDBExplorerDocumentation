import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, 
  TableSortLabel, FormControl, InputLabel, Select, MenuItem, Chip, CircularProgress, TextField, Button,
  Tooltip, IconButton, Collapse, Alert, FormControlLabel, Switch, Dialog, DialogTitle, DialogContent, 
  DialogActions, DialogContentText, Divider, Menu, ListItemIcon, ListItemText, Tabs, Tab, Accordion, 
  AccordionSummary, AccordionDetails, List, ListItem, ListItemText as MuiListItemText
} from '@mui/material';
import { jobsAPI, connectionsAPI, commentsAPI } from '../services/api';
import logger from '../utils/logger';
import InfoIcon from '@mui/icons-material/Info';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import TimerIcon from '@mui/icons-material/Timer';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import CommentIcon from '@mui/icons-material/Comment';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import { SvgIcon } from '@mui/material';

// Couleurs prédéfinies pour les tags
const TAG_COLORS = [
  '#2196F3', // bleu
  '#4CAF50', // vert
  '#F44336', // rouge
  '#FF9800', // orange
  '#9C27B0', // violet
  '#00BCD4', // cyan
  '#795548', // marron
  '#607D8B', // bleu-gris
];

// Map pour stocker les associations mot -> couleur
const tagColorMap = new Map();
let colorIndex = 0;

// Fonction pour obtenir une couleur pour un tag
const getTagColor = (tag) => {
  if (!tagColorMap.has(tag)) {
    tagColorMap.set(tag, TAG_COLORS[colorIndex % TAG_COLORS.length]);
    colorIndex++;
  }
  return tagColorMap.get(tag);
};

// Fonction pour formater le nom du job avec des tags colorés
const formatJobName = (name) => {
  const parts = name.split(/(\[[^\]]+\])/);
  return parts.map((part, index) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      const tag = part.slice(1, -1);
      return (
        <Typography
          key={index}
          component="span"
          sx={{
            color: getTagColor(tag),
            fontWeight: 'bold',
            display: 'inline'
          }}
        >
          {part}
        </Typography>
      );
    }
    return <Typography key={index} component="span" sx={{ display: 'inline' }}>{part}</Typography>;
  });
};

const STATUS_COLORS = {
  'Succès': 'success',
  'Échec': 'error',
  'Nouvelle tentative': 'warning',
  'Annulé': 'warning',
  'En cours': 'primary',
  'Inconnu': 'default'
};

const SqlServerIcon = (props) => (
  <SvgIcon {...props}>
    <path d="M3 4v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm4.5 2c.83 0 1.5.67 1.5 1.5S8.33 9 7.5 9 6 8.33 6 7.5 6.67 6 7.5 6zm6.5 1.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 9 15.5 9 14 8.33 14 7.5zM7.5 16c-.83 0-1.5-.67-1.5-1.5S6.67 13 7.5 13s1.5.67 1.5 1.5S8.33 16 7.5 16zm6.5-1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z"/>
  </SvgIcon>
);

// Fonction utilitaire pour extraire package et paramètres d'une commande SSIS
function parseSsisCommand(command) {
  if (!command) return null;
  // Cherche le package (après /SQL ou /FILE)
  const pkgMatch = command.match(/\/(SQL|FILE)\s+\"([^\"]+)\"/i);
  const packagePath = pkgMatch ? pkgMatch[2] : null;
  // Cherche tous les paramètres /SET
  const paramRegex = /\/SET\s+\"([^\"]+)\";\"([^\"]*)\"/g;
  let params = [];
  let match;
  while ((match = paramRegex.exec(command)) !== null) {
    params.push({ name: match[1], value: match[2] });
  }
  return { packagePath, params };
}

function Row({ job, connectionName, onJobAction }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);  // Nouvel état pour les erreurs d'action
  const [actionLoading, setActionLoading] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [loadingComment, setLoadingComment] = useState(false);
  const [startMenuAnchor, setStartMenuAnchor] = useState(null);
  const [existingComment, setExistingComment] = useState(null);
  const [stepsLoaded, setStepsLoaded] = useState(false); // Ajouté pour éviter de recharger inutilement
  const [stepDetailsDialogOpen, setStepDetailsDialogOpen] = useState(false);
  const [selectedStep, setSelectedStep] = useState(null);
  const [stepDetails, setStepDetails] = useState(null);
  const [loadingStepDetails, setLoadingStepDetails] = useState(false);
  const [stepDetailsError, setStepDetailsError] = useState(null);
  const [editingCommand, setEditingCommand] = useState(false);
  const [editedCommand, setEditedCommand] = useState('');
  const [savingCommand, setSavingCommand] = useState(false);

  // Ne pas charger les steps au montage
  // Charger les steps uniquement lors de l'ouverture du collapse
  const handleExpandClick = () => {
    setOpen((prev) => {
      const newOpen = !prev;
      if (newOpen && !stepsLoaded) {
        fetchSteps();
      }
      return newOpen;
    });
  };

  const fetchSteps = async () => {
    setLoadingSteps(true);
    setError(null);
    try {
      const response = await jobsAPI.getSteps(job.connectionId, job.id);
      if (Array.isArray(response.data)) {
        setSteps(response.data);
        setStepsLoaded(true); // Steps chargés
      } else if (response.data.error) {
        setError(response.data.error);
        setSteps([]);
      } else {
        setError('Format de réponse invalide');
        setSteps([]);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des steps:', err);
      setError(err.message || 'Impossible de charger les étapes du job');
      setSteps([]);
    } finally {
      setLoadingSteps(false);
    }
  };

  const fetchStepDetails = async (step) => {
    setSelectedStep(step);
    setStepDetailsDialogOpen(true);
    setLoadingStepDetails(true);
    setStepDetailsError(null);
    setStepDetails(null);
    setEditingCommand(false);
    setEditedCommand('');
    
    try {
      const response = await jobsAPI.getStepDetails(job.connectionId, job.id, step.id);
      setStepDetails(response.data);
      setEditedCommand(response.data.step.command);
    } catch (err) {
      console.error('Erreur lors du chargement des détails de la step:', err);
      setStepDetailsError(err.message || 'Impossible de charger les détails de l\'étape');
    } finally {
      setLoadingStepDetails(false);
    }
  };

  const handleSaveCommand = async () => {
    if (!editingCommand || !editedCommand.trim()) return;
    
    setSavingCommand(true);
    try {
      await jobsAPI.updateStepCommand(job.connectionId, job.id, selectedStep.id, editedCommand.trim());
      
      // Mettre à jour les détails locaux
      setStepDetails(prev => ({
        ...prev,
        step: {
          ...prev.step,
          command: editedCommand.trim()
        }
      }));
      
      setEditingCommand(false);
      // Afficher un message de succès
      alert('Commande mise à jour avec succès !');
    } catch (err) {
      console.error('Erreur lors de la sauvegarde de la commande:', err);
      alert('Erreur lors de la sauvegarde de la commande: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingCommand(false);
    }
  };

  const handleJobAction = async (action, stepId = null) => {
    logger.ui('handleJobAction appelé', { action, stepId, job });
    setActionLoading(true);
    setActionError(null);  // Réinitialiser l'erreur
    try {
      switch (action) {
        case 'start':
          await jobsAPI.startJob(job.connectionId, job.id, stepId);
          break;
        case 'stop':
          await jobsAPI.stopJob(job.connectionId, job.id);
          break;
        case 'toggle':
          await jobsAPI.toggleJob(job.connectionId, job.id, !job.enabled);
          break;
      }
      if (onJobAction) onJobAction();
    } catch (err) {
      console.error(`Erreur lors de l'action ${action} sur le job:`, err);
      const errorMessage = err.response?.data?.error || err.message || `Impossible d'exécuter l'action ${action}`;
      setActionError(errorMessage);
    } finally {
      setActionLoading(false);
      setStartMenuAnchor(null); // Fermer le menu après l'action
    }
  };

  const handleStartClick = (event) => {
    setStartMenuAnchor(event.currentTarget); // Ouvre le menu immédiatement
    if (steps.length === 0) {
      fetchSteps();
    }
  };

  const handleStartMenuClose = () => {
    setStartMenuAnchor(null);
  };

  // Supprimer le useEffect qui charge le commentaire au montage
  // Charger le commentaire uniquement lors de l'ouverture du dialogue
  const handleOpenCommentDialog = async () => {
    setCommentDialogOpen(true);
    setLoadingComment(true);
    try {
      const response = await commentsAPI.getByObject(
        job.connectionId,
        'msdb',  // Les jobs sont toujours dans msdb
        'JOB',
        job.name,
        'dbo'  // Les jobs sont toujours dans le schéma dbo
      );
      if (response.data && response.data.length > 0) {
        const existingComment = response.data[0];
        setComment(existingComment.comment);
        setExistingComment(existingComment);
      } else {
        setComment('');
        setExistingComment(null);
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        setComment('');
        setExistingComment(null);
      } else {
        console.error('Erreur lors du chargement du commentaire:', err);
      }
    } finally {
      setLoadingComment(false);
    }
  };

  const handleCommentSave = async () => {
    setLoadingComment(true);
    try {
      const commentData = {
        connection_id: job.connectionId,
        database_name: 'msdb',
        object_type: 'JOB',
        object_name: job.name,
        schema_name: 'dbo',
        comment: comment.trim()
      };

      if (existingComment) {
        // Mise à jour
        await commentsAPI.update(existingComment.id, { comment: comment.trim() });
      } else if (comment.trim() !== '') {
        // Création uniquement si le commentaire n'est pas vide
        await commentsAPI.create(commentData);
      }
      setCommentDialogOpen(false);
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du commentaire:', err);
      setError('Impossible de sauvegarder le commentaire');
    } finally {
      setLoadingComment(false);
    }
  };

  return (
    <>
      <TableRow 
        hover
        sx={{
          '& > *': { borderBottom: 'unset' },
          backgroundColor: open ? 'rgba(0, 0, 0, 0.04)' : 'inherit'
        }}
      >
        <TableCell padding="checkbox">
          <IconButton
            aria-label="expand row"
            size="small"
            onClick={handleExpandClick}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title={job.name} placement="top">
              <Box
                sx={{ 
                  flexGrow: 1,
                  maxWidth: 'calc(100% - 80px)',
                  display: 'inline-block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {formatJobName(job.name)}
              </Box>
            </Tooltip>
            {job.isCurrentlyRunning && (
              <Chip 
                label="En cours" 
                color="primary" 
                size="small" 
                sx={{ ml: 1, animation: 'pulse 2s infinite', flexShrink: 0 }}
              />
            )}
            {job.description && (
              <Tooltip title={job.description} placement="top">
                <IconButton size="small" sx={{ ml: 1, flexShrink: 0 }}>
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </TableCell>
        <TableCell>
          <Chip 
            label={job.enabled ? 'Oui' : 'Non'} 
            color={job.enabled ? 'success' : 'default'} 
            size="small" 
          />
        </TableCell>
        <TableCell>
          <Chip 
            label={job.lastRunStatus} 
            color={STATUS_COLORS[job.lastRunStatus] || 'default'} 
            size="small" 
          />
        </TableCell>
        <TableCell>
          <Typography noWrap variant="body2">
            {job.lastRunDate}
            <Typography noWrap variant="caption" display="block" color="textSecondary">
              {job.lastRunTime}
              {job.lastRunDuration && ` (${job.lastRunDuration})`}
            </Typography>
          </Typography>
        </TableCell>
        <TableCell>
          <Typography noWrap variant="body2">
            {job.nextRunDate !== 'Non planifié' ? (
              <>
                {job.nextRunDate}
                <Typography noWrap variant="caption" display="block" color="textSecondary">
                  {job.nextRunTime}
                </Typography>
              </>
            ) : (
              <Typography variant="caption" color="textSecondary">
                Non planifié
              </Typography>
            )}
          </Typography>
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title={job.isCurrentlyRunning ? "Arrêter" : "Démarrer"}>
                <IconButton 
                  size="small" 
                  color={job.isCurrentlyRunning ? "error" : "success"}
                  onClick={job.isCurrentlyRunning ? () => handleJobAction('stop') : handleStartClick}
                  disabled={actionLoading}
                >
                  {job.isCurrentlyRunning ? <StopIcon /> : <PlayArrowIcon />}
                </IconButton>
              </Tooltip>

              <Menu
                anchorEl={startMenuAnchor}
                open={Boolean(startMenuAnchor)}
                onClose={handleStartMenuClose}
              >
                <MenuItem onClick={() => handleJobAction('start')}>
                  <ListItemIcon>
                    <PlayArrowIcon fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText>Démarrer depuis le début</ListItemText>
                </MenuItem>
                <Divider />
                {loadingSteps && (
                  <MenuItem disabled>
                    <CircularProgress size={16} sx={{ mr: 1 }} /> Chargement des étapes…
                  </MenuItem>
                )}
                {!loadingSteps && steps.map((step) => (
                  <MenuItem 
                    key={step.id} 
                    onClick={() => handleJobAction('start', step.id)}
                  >
                    <ListItemIcon>
                      <PlayCircleOutlineIcon fontSize="small" color="success" />
                    </ListItemIcon>
                    <ListItemText>
                      Démarrer à l'étape {step.id}: {step.name}
                    </ListItemText>
                  </MenuItem>
                ))}
              </Menu>

              <Tooltip title={job.enabled ? "Désactiver" : "Activer"}>
                <IconButton 
                  size="small" 
                  color={job.enabled ? "warning" : "primary"}
                  onClick={() => handleJobAction('toggle')}
                  disabled={actionLoading}
                >
                  <PowerSettingsNewIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={comment ? "Modifier le commentaire" : "Ajouter un commentaire"}>
                <IconButton
                  size="small"
                  color={comment ? "primary" : "default"}
                  onClick={handleOpenCommentDialog}
                >
                  <CommentIcon />
                </IconButton>
              </Tooltip>
            </Box>
            {actionError && (
              <Alert 
                severity="error" 
                size="small"
                sx={{ 
                  py: 0,
                  '& .MuiAlert-message': { 
                    padding: '2px 0',
                    fontSize: '0.75rem'
                  }
                }}
              >
                {actionError}
              </Alert>
            )}
            {actionLoading && (
              <Box display="flex" justifyContent="center">
                <CircularProgress size={16} />
              </Box>
            )}
          </Box>
        </TableCell>
      </TableRow>
      <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 2 }}>
              <Typography variant="h6" gutterBottom component="div">
                Étapes du job
              </Typography>
              {loadingSteps ? (
                <Box display="flex" justifyContent="center" p={2}>
                  <CircularProgress size={24} />
                </Box>
              ) : error ? (
                <Alert 
                  severity="error" 
                  sx={{ mb: 2 }}
                  action={
                    <Button color="inherit" size="small" onClick={fetchSteps}>
                      Réessayer
                    </Button>
                  }
                >
                  {error}
                </Alert>
              ) : steps.length === 0 ? (
                <Typography color="textSecondary">
                  Aucune étape trouvée pour ce job
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width="5%">#</TableCell>
                      <TableCell width="20%">Nom</TableCell>
                      <TableCell width="12%">Sous-système</TableCell>
                      <TableCell width="15%">Nom Package</TableCell>
                      <TableCell width="12%">Dernier statut</TableCell>
                      <TableCell width="15%">Dernière exécution</TableCell>
                      <TableCell width="15%">Message</TableCell>
                      <TableCell width="6%">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {steps.map((step) => {
                      let ssisInfo = null;
                      if (step.subsystem && step.subsystem.toUpperCase() === 'SSIS') {
                        ssisInfo = parseSsisCommand(step.command);
                      }
                      return (
                        <TableRow key={step.id}>
                          <TableCell>{step.id}</TableCell>
                          <TableCell>
                            <Tooltip title={step.command} placement="top">
                              <Box>
                                <Typography variant="body2" noWrap>{step.name}</Typography>
                                {ssisInfo && ssisInfo.params.length > 0 && (
                                  <Box sx={{ mt: 0.5, ml: 1 }}>
                                    <Box component="ul" sx={{ pl: 2, mb: 0 }}>
                                      {ssisInfo.params.map((p, idx) => (
                                        <li key={idx}>
                                          <Typography variant="caption" color="secondary">
                                            {p.name} = {p.value}
                                          </Typography>
                                        </li>
                                      ))}
                                    </Box>
                                  </Box>
                                )}
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap>
                              {step.subsystem}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap color="primary">
                              {ssisInfo && ssisInfo.packagePath ? ssisInfo.packagePath : ''}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={step.lastRunStatus} 
                              color={STATUS_COLORS[step.lastRunStatus] || 'default'} 
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap>
                              {step.lastRunDate} {step.lastRunTime}
                            </Typography>
                            {step.lastRunDuration && (
                              <Typography variant="caption" display="block" color="textSecondary" noWrap>
                                Durée: {step.lastRunDuration}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Tooltip title={step.lastRunMessage || 'Aucun message'} placement="top">
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {step.lastRunMessage || 'Aucun message'}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Tooltip title="Voir les détails de l'étape" placement="top">
                              <IconButton
                                size="small"
                                onClick={() => fetchStepDetails(step)}
                                sx={{ p: 0.5 }}
                              >
                                <InfoIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>

      {/* Dialog pour les détails d'une step */}
      <Dialog 
        open={stepDetailsDialogOpen} 
        onClose={() => setStepDetailsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">
              Détails de l'étape {selectedStep?.id}: {selectedStep?.name}
            </Typography>
            <IconButton onClick={() => setStepDetailsDialogOpen(false)}>
              <InfoIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingStepDetails ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : stepDetailsError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {stepDetailsError}
            </Alert>
          ) : stepDetails ? (
            <Box>
              {/* Détails de la step et Historique côte à côte */}
              <Grid container spacing={2}>
                {/* Détails de la step */}
                <Grid item xs={12} md={6}>
                  <Accordion defaultExpanded sx={{ '& .MuiAccordionSummary-root': { backgroundColor: '#e8f5e8' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box display="flex" alignItems="center">
                        <InfoIcon sx={{ mr: 1, color: '#2e7d32' }} />
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Détails de l'étape</Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ backgroundColor: '#f8fff8' }}>
                      <Grid container spacing={2}>
                        {/* Informations du job */}
                        <Grid item xs={12}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#1976d2', mb: 1, borderBottom: '1px solid #e0e0e0', pb: 0.5 }}>
                            📋 Informations du job
                          </Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Nom du job:</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.jobInfo.name}</Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Catégorie:</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.jobInfo.category}</Typography>
                        </Grid>
                        {stepDetails.jobInfo.description && (
                          <Grid item xs={12}>
                            <Typography variant="body2" color="textSecondary">Description:</Typography>
                            <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.jobInfo.description}</Typography>
                          </Grid>
                        )}
                        
                        {/* Informations de l'étape */}
                        <Grid item xs={12}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#2e7d32', mb: 1, borderBottom: '1px solid #e0e0e0', pb: 0.5 }}>
                            ⚙️ Informations de l'étape
                          </Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Nom:</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.step.name}</Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Sous-système:</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.step.subsystem}</Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Base de données:</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.step.databaseName || 'Non spécifiée'}</Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Utilisateur:</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.step.databaseUserName || 'Non spécifié'}</Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Tentatives de retry:</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.step.retryAttempts}</Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Intervalle de retry (minutes):</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.step.retryInterval}</Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Action en cas de succès:</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.step.onSuccessAction}</Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="textSecondary">Action en cas d'échec:</Typography>
                          <Typography variant="body1" sx={{ mb: 1 }}>{stepDetails.step.onFailAction}</Typography>
                        </Grid>
                        {stepDetails.step.outputFileName && (
                          <Grid item xs={12}>
                            <Typography variant="body2" color="textSecondary">Fichier de sortie:</Typography>
                            <Typography variant="body1">{stepDetails.step.outputFileName}</Typography>
                          </Grid>
                        )}
                        <Grid item xs={12}>
                          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                            <Typography variant="body2" color="textSecondary">Commande:</Typography>
                            <Box>
                              <Button
                                size="small"
                                variant="outlined"
                                color="primary"
                                onClick={() => setEditingCommand(!editingCommand)}
                                sx={{ mr: 1 }}
                              >
                                {editingCommand ? 'Annuler' : 'Modifier'}
                              </Button>
                              {editingCommand && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="success"
                                  onClick={handleSaveCommand}
                                  disabled={savingCommand}
                                >
                                  {savingCommand ? 'Sauvegarde...' : 'Sauvegarder'}
                                </Button>
                              )}
                            </Box>
                          </Box>
                          <TextField
                            fullWidth
                            multiline
                            rows={4}
                            value={editingCommand ? editedCommand : stepDetails.step.command}
                            onChange={(e) => setEditedCommand(e.target.value)}
                            variant="outlined"
                            size="small"
                            disabled={!editingCommand}
                            InputProps={{
                              style: { fontFamily: 'monospace', fontSize: '0.875rem' }
                            }}
                          />
                        </Grid>
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                </Grid>

                {/* Historique */}
                <Grid item xs={12} md={6}>
                  <Accordion defaultExpanded sx={{ '& .MuiAccordionSummary-root': { backgroundColor: '#f3e5f5' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box display="flex" alignItems="center">
                        <HistoryIcon sx={{ mr: 1, color: '#7b1fa2' }} />
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Historique (5 derniers)</Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ backgroundColor: '#faf5ff' }}>
                      {stepDetails.history.length === 0 ? (
                        <Typography color="textSecondary">Aucun historique disponible</Typography>
                      ) : (
                        <>
                                                     <Table size="small" sx={{ mb: 2 }}>
                             <TableHead>
                               <TableRow sx={{ backgroundColor: '#f0f0f0' }}>
                                 <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                                 <TableCell sx={{ fontWeight: 'bold' }}>Heure</TableCell>
                                 <TableCell sx={{ fontWeight: 'bold' }}>Durée</TableCell>
                                 <TableCell sx={{ fontWeight: 'bold' }}>Statut</TableCell>
                                 <TableCell sx={{ fontWeight: 'bold' }}>Message</TableCell>
                               </TableRow>
                             </TableHead>
                             <TableBody>
                               {stepDetails.history.map((execution, index) => (
                                 <TableRow key={index} sx={{ 
                                   backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9',
                                   '&:hover': { backgroundColor: '#f0f8ff' },
                                   ...(execution.runStatus === 'Échec' && {
                                     backgroundColor: '#ffebee',
                                     '&:hover': { backgroundColor: '#ffcdd2' }
                                   })
                                 }}>
                                   <TableCell>{execution.runDate}</TableCell>
                                   <TableCell>{execution.runTime}</TableCell>
                                   <TableCell>{execution.runDuration}</TableCell>
                                   <TableCell>
                                     <Chip 
                                       label={execution.runStatus} 
                                       color={STATUS_COLORS[execution.runStatus] || 'default'} 
                                       size="small"
                                     />
                                   </TableCell>
                                   <TableCell>
                                     <Tooltip title={execution.message || 'Aucun message'} placement="top">
                                       <Typography 
                                         variant="body2" 
                                         noWrap 
                                         sx={{ 
                                           maxWidth: 150,
                                           ...(execution.runStatus === 'Échec' && {
                                             color: '#d32f2f',
                                             fontWeight: 'bold'
                                           })
                                         }}
                                       >
                                         {execution.message || 'Aucun message'}
                                       </Typography>
                                     </Tooltip>
                                   </TableCell>
                                 </TableRow>
                               ))}
                             </TableBody>
                                                      </Table>
                           
                           {/* Section des échecs récents */}
                           {stepDetails.history.filter(e => e.runStatus === 'Échec').length > 0 && (
                             <Box sx={{ mt: 2, p: 2, backgroundColor: '#ffebee', borderRadius: 1, border: '1px solid #ffcdd2' }}>
                               <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#d32f2f', mb: 1 }}>
                                 ⚠️ Échecs récents
                               </Typography>
                               {stepDetails.history
                                 .filter(execution => execution.runStatus === 'Échec')
                                 .slice(0, 3) // Limiter à 3 échecs récents
                                 .map((execution, index) => (
                                   <Box key={index} sx={{ mb: 1, p: 1, backgroundColor: '#fff', borderRadius: 1 }}>
                                     <Typography variant="caption" color="textSecondary">
                                       {execution.runDate} {execution.runTime} - Durée: {execution.runDuration}
                                     </Typography>
                                     {execution.message && (
                                       <Typography variant="body2" sx={{ mt: 0.5, color: '#d32f2f', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                         {execution.message}
                                       </Typography>
                                     )}
                                   </Box>
                                 ))}
                             </Box>
                           )}
                           
                           <Box display="flex" justifyContent="center" mt={2}>
                             <Button 
                               variant="outlined" 
                               color="primary"
                               startIcon={<HistoryIcon />}
                               onClick={() => {
                                 // TODO: Implémenter la vue complète de l'historique
                                 alert('Fonctionnalité "Voir plus" à implémenter');
                               }}
                             >
                               Voir plus d'historique
                             </Button>
                           </Box>
                        </>
                      )}
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              </Grid>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStepDetailsDialogOpen(false)}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog pour les commentaires */}
      <Dialog 
        open={commentDialogOpen} 
        onClose={() => setCommentDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {comment ? "Modifier le commentaire" : "Ajouter un commentaire"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Job: {job.name}
          </DialogContentText>
          <TextField
            autoFocus
            multiline
            rows={4}
            fullWidth
            variant="outlined"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Entrez votre commentaire ici..."
            disabled={loadingComment}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommentDialogOpen(false)} disabled={loadingComment}>
            Annuler
          </Button>
          <Button 
            onClick={handleCommentSave} 
            variant="contained" 
            disabled={loadingComment}
            startIcon={loadingComment ? <CircularProgress size={20} /> : null}
          >
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const SqlJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [connections, setConnections] = useState({});
  const [loading, setLoading] = useState(false); // false par défaut
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Ajouter les états pour le tri des jobs
  const [orderBy, setOrderBy] = useState('name');
  const [order, setOrder] = useState('asc');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterServer, setFilterServer] = useState('');
  const [filterRunning, setFilterRunning] = useState(false);
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false); // Désactivé par défaut
  const [hasLoaded, setHasLoaded] = useState(false); // Pour savoir si la liste a déjà été chargée
  const intervalRef = useRef(null);

  const fetchConnections = async () => {
    try {
      const response = await connectionsAPI.getActive();
      const connectionsMap = {};
      response.data.forEach(conn => {
        connectionsMap[conn.id] = conn;
      });
      setConnections(connectionsMap);
    } catch (err) {
      console.error('Erreur lors du chargement des connexions:', err);
    }
  };

  const fetchJobs = async () => {
    if (!loading) setRefreshing(true);
    setError(null);
    setLoading(true); // Ajouté pour afficher le loader lors du premier chargement
    try {
      const response = await jobsAPI.getAll();
      const allJobs = [];
      Object.entries(response.data).forEach(([connId, jobsArr]) => {
        (jobsArr || [])
          .filter(job => 
            job.category !== 'REPL-Distribution' && 
            job.category !== 'REPL-LogReader'
          )
          .forEach(job => {
            allJobs.push({ ...job, connectionId: connId });
          });
      });
      setJobs(allJobs);
      setHasLoaded(true); // On note que la liste a été chargée au moins une fois
    } catch (err) {
      console.error('Erreur lors du chargement des jobs:', err);
      let errorMessage = 'Erreur lors du chargement des jobs SQL';
      if (err.code === 'ERR_NETWORK') {
        errorMessage = 'Impossible de se connecter au serveur. Vérifiez que le serveur backend est démarré.';
      } else if (err.response) {
        errorMessage = `Erreur ${err.response.status}: ${err.response.data.message || 'Une erreur est survenue'}`;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Gestion du rafraîchissement automatique
  useEffect(() => {
    // Nettoyage de l'intervalle existant
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Configuration du nouveau rafraîchissement si activé ET si la liste a déjà été chargée
    if (autoRefresh && hasLoaded) {
      intervalRef.current = setInterval(fetchJobs, 30000);
              logger.ui('Rafraîchissement automatique activé');
    }
    // Nettoyage lors du démontage du composant
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, hasLoaded]);

  // Chargement initial des connexions uniquement
  useEffect(() => {
    fetchConnections();
  }, []);

  // Chargement initial des jobs
  useEffect(() => {
    fetchJobs();
  }, []);

  // Les filtres s'appliquent maintenant uniquement sur les données en mémoire
  // Pas de rechargement à chaque changement de filtre

  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const categories = [...new Set(jobs.map(job => job.category))];
  const servers = Object.values(connections).filter(conn => conn.type === 'sqlserver');

  const filteredJobs = jobs.filter(job => {
    if (filterStatus && job.lastRunStatus !== filterStatus) return false;
    if (filterEnabled && String(job.enabled) !== filterEnabled) return false;
    if (filterCategory && job.category !== filterCategory) return false;
    if (filterServer && job.connectionId !== filterServer) return false;
    if (filterRunning && !job.isCurrentlyRunning) return false;
    if (search && !job.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sortedJobs = filteredJobs.sort((a, b) => {
    let aValue = a[orderBy];
    let bValue = b[orderBy];
    if (aValue === undefined) aValue = '';
    if (bValue === undefined) bValue = '';
    if (order === 'asc') return String(aValue).localeCompare(String(bValue));
    return String(bValue).localeCompare(String(aValue));
  });

  return (
    <Box sx={{ width: '100%' }}>
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.6; }
            100% { opacity: 1; }
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .sql-server-icon {
            position: relative;
            display: inline-flex;
            align-items: center;
            margin-right: 16px;
          }
          .sql-server-icon .background-icon {
            color: #0078D4;
            font-size: 40px;
          }
          .sql-server-icon .overlay-icon {
            position: absolute;
            right: -8px;
            bottom: -8px;
            color: #107C10;
            font-size: 20px;
            background: white;
            border-radius: 50%;
          }
        `}
      </style>
      <Box display="flex" alignItems="center" mb={2}>
        <Box display="flex" alignItems="center" style={{ flexGrow: 1 }}>
          <Box className="sql-server-icon">
            <SqlServerIcon className="background-icon" />
            <TimerIcon className="overlay-icon" />
          </Box>
          <Typography variant="h4">SQL Jobs</Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              color="primary"
            />
          }
          label={
            <Box display="flex" alignItems="center">
              <AutorenewIcon sx={{ mr: 0.5, fontSize: 20 }} />
              Rafraîchissement auto
            </Box>
          }
          sx={{ mr: 2 }}
        />
        {refreshing && (
          <CircularProgress 
            size={20} 
            sx={{ mr: 2 }}
          />
        )}
      </Box>
      
      {error ? (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={fetchJobs}>
              Réessayer
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Recherche par nom"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Serveur</InputLabel>
                <Select
                  value={filterServer}
                  onChange={e => setFilterServer(e.target.value)}
                  label="Serveur"
                >
                  <MenuItem value="">Tous</MenuItem>
                  {servers.map(server => (
                    <MenuItem key={server.id} value={server.id}>
                      {server.name || server.host}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Statut</InputLabel>
                <Select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  label="Statut"
                >
                  <MenuItem value="">Tous</MenuItem>
                  <MenuItem value="Succès">Succès</MenuItem>
                  <MenuItem value="Échec">Échec</MenuItem>
                  <MenuItem value="En cours">En cours</MenuItem>
                  <MenuItem value="Annulé">Annulé</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel>Catégorie</InputLabel>
                <Select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  label="Catégorie"
                >
                  <MenuItem value="">Toutes</MenuItem>
                  {categories.map(cat => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel>Activé</InputLabel>
                <Select
                  value={filterEnabled}
                  onChange={e => setFilterEnabled(e.target.value)}
                  label="Activé"
                >
                  <MenuItem value="">Tous</MenuItem>
                  <MenuItem value="true">Oui</MenuItem>
                  <MenuItem value="false">Non</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={1}>
              <FormControlLabel
                control={
                  <Switch
                    checked={filterRunning}
                    onChange={(e) => setFilterRunning(e.target.checked)}
                    color="primary"
                    size="small"
                  />
                }
                label="En cours"
                sx={{ 
                  m: 0,
                  '.MuiFormControlLabel-label': {
                    fontSize: '0.875rem'
                  }
                }}
              />
            </Grid>
            <Grid item xs={12} md={1}>
              <Button 
                variant="outlined" 
                fullWidth 
                onClick={fetchJobs} 
                disabled={refreshing}
                startIcon={refreshing ? <CircularProgress size={16} /> : null}
                title="Recharger les données depuis le serveur"
              >
                Rafraîchir
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
          <CircularProgress />
        </Box>
      ) : (
        <>
        <TableContainer 
          component={Paper} 
          sx={{ 
            mt: 2,
            '& .MuiTableCell-root': {
              py: 1.5,  // padding vertical réduit
              '&.MuiTableCell-head': {
                backgroundColor: (theme) => theme.palette.grey[100],
                fontWeight: 'bold'
              }
            },
            '& .MuiTableRow-root:hover': {
              backgroundColor: (theme) => theme.palette.action.hover
            }
          }}
        >
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: '48px' }} />
                <TableCell sx={{ width: '35%' }}>
                  <TableSortLabel
                    active={orderBy === 'name'}
                    direction={orderBy === 'name' ? order : 'asc'}
                    onClick={() => handleSort('name')}
                  >
                    Nom
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: '8%' }}>
                  <TableSortLabel
                    active={orderBy === 'enabled'}
                    direction={orderBy === 'enabled' ? order : 'asc'}
                    onClick={() => handleSort('enabled')}
                  >
                    Activé
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: '10%' }}>
                  <TableSortLabel
                    active={orderBy === 'lastRunStatus'}
                    direction={orderBy === 'lastRunStatus' ? order : 'asc'}
                    onClick={() => handleSort('lastRunStatus')}
                  >
                    Statut
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: '17%' }}>
                  <TableSortLabel
                    active={orderBy === 'lastRunDate'}
                    direction={orderBy === 'lastRunDate' ? order : 'asc'}
                    onClick={() => handleSort('lastRunDate')}
                  >
                    Dernière exécution
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: '17%' }}>
                  <TableSortLabel
                    active={orderBy === 'nextRunDate'}
                    direction={orderBy === 'nextRunDate' ? order : 'asc'}
                    onClick={() => handleSort('nextRunDate')}
                  >
                    Prochaine exécution
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: '13%' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedJobs.map((job, idx) => (
                <Row 
                  key={`${job.connectionId}-${job.id}`} 
                  job={job}
                  connectionName={connections[job.connectionId]?.name || connections[job.connectionId]?.host || job.connectionId}
                  onJobAction={fetchJobs}
                />
              ))}
              {sortedJobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center">Aucun job trouvé</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </>
      )}
    </Box>
  );
};

export default SqlJobs; 