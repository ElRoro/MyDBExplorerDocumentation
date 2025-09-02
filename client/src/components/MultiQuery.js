import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Card,
  CardContent,
  CardActions,
  Grid,
  Alert,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  Divider,
  Badge,
  Stack,
  CircularProgress,
  AlertTitle,
  Collapse,
} from '@mui/material';
import {
  PlayArrow as ExecuteIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Schedule as ScheduleIcon,
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  QueryStats as QueryStatsIcon,
} from '@mui/icons-material';
import { connectionsAPI } from '../services/api';
import axios from 'axios';
import * as XLSX from 'xlsx';

const MultiQuery = () => {
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [databases, setDatabases] = useState([]);
  const [selectedDatabases, setSelectedDatabases] = useState([]);
  const [query, setQuery] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [timeout, setTimeout] = useState(30000);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [isAllCollapsed, setIsAllCollapsed] = useState(true);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [queryCollapsed, setQueryCollapsed] = useState(false);

  // Charger les connexions au montage du composant
  useEffect(() => {
    loadConnections();
  }, []);

  // Charger les bases de données quand une connexion est sélectionnée
  useEffect(() => {
    if (selectedConnection) {
      loadDatabases(selectedConnection);
    } else {
      setDatabases([]);
      setSelectedDatabases([]);
    }
  }, [selectedConnection]);

  // Replier automatiquement tous les résultats quand ils arrivent
  useEffect(() => {
    if (results && results.results) {
      setExpandedRows(new Set());
      setIsAllCollapsed(true);
    }
  }, [results]);

  const loadConnections = async () => {
    try {
      const response = await connectionsAPI.getActiveConnections();
      setConnections(response.data);
    } catch (error) {
      setError('Erreur lors du chargement des connexions: ' + error.message);
    }
  };

  const loadDatabases = async (connectionId) => {
    setLoadingDatabases(true);
    setError('');
    try {
      const response = await connectionsAPI.getDatabases(connectionId);
      setDatabases(response.data);
      setSelectedDatabases([]); // Réinitialiser la sélection
    } catch (error) {
      setError('Erreur lors du chargement des bases de données: ' + error.message);
      setDatabases([]);
    } finally {
      setLoadingDatabases(false);
    }
  };

  const handleDatabaseToggle = (databaseName) => {
    setSelectedDatabases(prev => {
      if (prev.includes(databaseName)) {
        return prev.filter(db => db !== databaseName);
      } else {
        return [...prev, databaseName];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedDatabases(databases);
  };

  const handleSelectNone = () => {
    setSelectedDatabases([]);
  };

  const executeQuery = async () => {
    if (!selectedConnection || selectedDatabases.length === 0 || !query.trim()) {
      setError('Veuillez sélectionner une connexion, des bases de données et saisir une requête');
      return;
    }

    setIsExecuting(true);
    setError('');
    setResults(null);
    
    // Minimiser les sections de configuration et requête
    setConfigCollapsed(true);
    setQueryCollapsed(true);

    try {
      const response = await axios.post('/api/multi-query/execute', {
        connectionId: selectedConnection,
        databases: selectedDatabases,
        query: query.trim(),
        timeout: timeout
      });

      setResults(response.data);
    } catch (error) {
      setError(error.response?.data?.error || error.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const exportToExcel = () => {
    if (!results) return;

    const workbook = XLSX.utils.book_new();
    
    // Feuille de résumé
    const summaryData = [
      ['Résumé de l\'exécution'],
      ['Connexion', results.connection.name],
      ['Type', results.connection.type],
      ['Requête', results.query],
      ['Total bases de données', results.totalDatabases],
      ['Exécutions réussies', results.successfulExecutions],
      ['Exécutions échouées', results.failedExecutions],
      ['Taux de succès', results.summary.successRate],
      ['Temps d\'exécution total (ms)', results.totalExecutionTime],
      ['Temps d\'exécution moyen (ms)', results.summary.averageExecutionTime],
      [''],
      ['Détails par base de données'],
      ['Base de données', 'Statut', 'Temps d\'exécution (ms)', 'Erreur']
    ];

    results.results.forEach(result => {
      summaryData.push([
        result.database,
        result.success ? 'Succès' : 'Échec',
        result.executionTime,
        result.error || ''
      ]);
    });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Résumé');

    // Feuilles pour chaque base de données avec succès
    results.results.filter(r => r.success && r.data && r.data.length > 0).forEach(result => {
      const sheetName = result.database.substring(0, 31); // Excel limite à 31 caractères
      const dataSheet = XLSX.utils.json_to_sheet(result.data);
      XLSX.utils.book_append_sheet(workbook, dataSheet, sheetName);
    });

    XLSX.writeFile(workbook, `multi-query-results-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const toggleRowExpansion = (databaseName) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(databaseName)) {
        newSet.delete(databaseName);
      } else {
        newSet.add(databaseName);
      }
      return newSet;
    });
  };

  const toggleAllCollapsed = () => {
    if (isAllCollapsed) {
      // Déplier tout
      const allDatabases = results.results
        .filter(r => r.success && r.data && r.data.length > 0)
        .map(r => r.database);
      setExpandedRows(new Set(allDatabases));
      setIsAllCollapsed(false);
    } else {
      // Replier tout
      setExpandedRows(new Set());
      setIsAllCollapsed(true);
    }
  };

  const getStatusIcon = (success) => {
    return success ? <SuccessIcon color="success" /> : <ErrorIcon color="error" />;
  };

  const getStatusColor = (success) => {
    return success ? 'success' : 'error';
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <QueryStatsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h5" component="h1">
          Requête Multi-Bases
        </Typography>
      </Box>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Exécutez une même requête SQL sur plusieurs bases de données simultanément
      </Typography>

             {/* Configuration */}
       <Card sx={{ mb: 3 }}>
         <CardContent>
           <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
             <Typography variant="h6">
               Configuration
             </Typography>
             <IconButton
               size="small"
               onClick={() => setConfigCollapsed(!configCollapsed)}
             >
               {configCollapsed ? <ExpandIcon /> : <CollapseIcon />}
             </IconButton>
           </Box>
           
           <Collapse in={!configCollapsed}>
          
          <Grid container spacing={3}>
            {/* Sélection de la connexion */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <Select
                  labelId="connection-select-label"
                  value={selectedConnection}
                  onChange={(e) => setSelectedConnection(e.target.value)}
                  disabled={isExecuting}
                  displayEmpty
                >
                  <MenuItem value="">
                    <em>Sélectionner une connexion</em>
                  </MenuItem>
                  {connections.map((connection) => (
                    <MenuItem key={connection.id} value={connection.id}>
                      {connection.name} ({connection.type})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Timeout */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                label="Timeout (ms)"
                type="number"
                value={timeout}
                onChange={(e) => setTimeout(parseInt(e.target.value) || 30000)}
                disabled={isExecuting}
                helperText="Délai maximum par base de données"
              />
            </Grid>

            {/* Sélection des bases de données */}
            <Grid item xs={12}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Bases de données ({selectedDatabases.length}/{databases.length})
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleSelectAll}
                    disabled={isExecuting || databases.length === 0}
                  >
                    Tout sélectionner
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleSelectNone}
                    disabled={isExecuting}
                  >
                    Aucune
                  </Button>
                </Stack>
              </Box>

              {loadingDatabases ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={20} />
                  <Typography>Chargement des bases de données...</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {databases.map((database) => (
                    <Chip
                      key={database}
                      label={database}
                      onClick={() => handleDatabaseToggle(database)}
                      color={selectedDatabases.includes(database) ? 'primary' : 'default'}
                      variant={selectedDatabases.includes(database) ? 'filled' : 'outlined'}
                      disabled={isExecuting}
                      clickable
                    />
                  ))}
                </Box>
              )}
                         </Grid>
           </Grid>
           </Collapse>
         </CardContent>
       </Card>

             {/* Requête SQL */}
       <Card sx={{ mb: 3 }}>
         <CardContent>
           <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
             <Typography variant="h6">
               Requête SQL
             </Typography>
             <IconButton
               size="small"
               onClick={() => setQueryCollapsed(!queryCollapsed)}
             >
               {queryCollapsed ? <ExpandIcon /> : <CollapseIcon />}
             </IconButton>
           </Box>
           
           <Collapse in={!queryCollapsed}>
          <TextField
            fullWidth
            multiline
            rows={6}
            label="Requête SQL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isExecuting}
            placeholder="SELECT * FROM information_schema.tables WHERE table_type = 'BASE TABLE'"
            helperText="Tous types de requêtes SQL autorisés (SELECT, INSERT, UPDATE, DELETE, etc.)"
                     />
           </Collapse>
         </CardContent>
         <CardActions>
           <Button
             variant="contained"
             startIcon={<ExecuteIcon />}
             onClick={executeQuery}
             disabled={isExecuting || !selectedConnection || selectedDatabases.length === 0 || !query.trim()}
             sx={{ minWidth: 150 }}
           >
             {isExecuting ? 'Exécution...' : 'Exécuter'}
           </Button>
         </CardActions>
       </Card>

      {/* Barre de progression */}
      {isExecuting && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress />
          <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
            Exécution en cours sur {selectedDatabases.length} base(s) de données...
          </Typography>
        </Box>
      )}

      {/* Messages d'erreur */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Résultats */}
      {results && (
        <Card>
          <CardContent>
                         <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
               <Typography variant="h6">
                 Résultats
               </Typography>
                               <Box sx={{ display: 'flex', gap: 1 }}>
                  {results.results.some(r => r.success && r.data && r.data.length > 0) && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={toggleAllCollapsed}
                    >
                      {isAllCollapsed ? 'Tout déplier' : 'Tout replier'}
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={exportToExcel}
                    disabled={results.results.length === 0}
                  >
                    Exporter Excel
                  </Button>
                </Box>
             </Box>

                         {/* Résumé */}
             <Alert severity="info" sx={{ mb: 2 }}>
               <AlertTitle>Résumé</AlertTitle>
               <Typography variant="body2">
                 <strong>Succès:</strong> {results.successfulExecutions} | <strong>Échecs:</strong> {results.failedExecutions}
               </Typography>
             </Alert>

                         {/* Détails par base de données */}
             <TableContainer component={Paper}>
               <Table size="small">
                                   <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox"></TableCell>
                      <TableCell>Base de données</TableCell>
                      <TableCell>Statut</TableCell>
                      <TableCell>Temps (ms)</TableCell>
                      <TableCell>Lignes</TableCell>
                    </TableRow>
                  </TableHead>
                 <TableBody>
                   {results.results.map((result, index) => {
                     const isExpanded = expandedRows.has(result.database);
                     const hasData = result.success && result.data && result.data.length > 0;
                     
                     return (
                       <React.Fragment key={index}>
                                                   <TableRow>
                            <TableCell padding="checkbox">
                              {hasData && (
                                <IconButton
                                  size="small"
                                  onClick={() => toggleRowExpansion(result.database)}
                                  disabled={!hasData}
                                >
                                  {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                                </IconButton>
                              )}
                            </TableCell>
                            <TableCell>{result.database}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {getStatusIcon(result.success)}
                                <Typography variant="body2" color={getStatusColor(result.success)}>
                                  {result.success ? 'Succès' : 'Échec'}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell>{result.executionTime}</TableCell>
                            <TableCell>
                              {result.success && result.data ? result.data.length : '-'}
                            </TableCell>
                          </TableRow>
                         
                                                   {/* Ligne de données expansible */}
                          {hasData && (
                            <TableRow>
                              <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
                               <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                 <Box sx={{ margin: 1 }}>
                                   <Typography variant="h6" gutterBottom component="div">
                                     Données pour {result.database} ({result.data.length} lignes)
                                   </Typography>
                                   <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                                     <Table size="small" stickyHeader>
                                       <TableHead>
                                         <TableRow>
                                           {Object.keys(result.data[0] || {}).map((key) => (
                                             <TableCell key={key} sx={{ fontWeight: 'bold' }}>
                                               {key}
                                             </TableCell>
                                           ))}
                                         </TableRow>
                                       </TableHead>
                                       <TableBody>
                                         {result.data.slice(0, 100).map((row, rowIndex) => (
                                           <TableRow key={rowIndex}>
                                             {Object.values(row).map((value, cellIndex) => (
                                               <TableCell key={cellIndex}>
                                                 {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                               </TableCell>
                                             ))}
                                           </TableRow>
                                         ))}
                                       </TableBody>
                                     </Table>
                                   </TableContainer>
                                   {result.data.length > 100 && (
                                     <Typography variant="body2" sx={{ mt: 1, textAlign: 'center', fontStyle: 'italic' }}>
                                       Affichage limité aux 100 premières lignes sur {result.data.length} totales
                                     </Typography>
                                   )}
                                 </Box>
                               </Collapse>
                             </TableCell>
                           </TableRow>
                         )}
                       </React.Fragment>
                     );
                   })}
                 </TableBody>
               </Table>
             </TableContainer>

            {/* Détails des erreurs */}
            {results.results.some(r => !r.success) && (
              <Accordion sx={{ mt: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle1" color="error">
                    Détails des erreurs ({results.failedExecutions})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {results.results.filter(r => !r.success).map((result, index) => (
                    <Alert key={index} severity="error" sx={{ mb: 1 }}>
                      <Typography variant="subtitle2">{result.database}</Typography>
                      <Typography variant="body2">{result.error}</Typography>
                    </Alert>
                  ))}
                </AccordionDetails>
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}

      
    </Box>
  );
};

export default MultiQuery;
