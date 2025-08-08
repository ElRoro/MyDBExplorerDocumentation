import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent, Grid, 
  FormControl, InputLabel, Select, MenuItem, Chip, CircularProgress,
  Alert, Table, TableBody, TableCell, TableContainer, TableHead, 
  TableRow, Paper, IconButton, Tooltip, Dialog, DialogTitle, 
  DialogContent, DialogActions, DialogContentText, TextareaAutosize,
  FormControlLabel, Checkbox, Accordion, AccordionSummary, 
  AccordionDetails, TablePagination, Snackbar, LinearProgress,
  TableSortLabel, List, ListItem, ListItemIcon, ListItemText, Divider
} from '@mui/material';
import { searchAPI, connectionsAPI, commentsAPI } from '../services/api';
import { 
  Search as SearchIcon, 
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  TableChart as TableIcon,
  Code as CodeIcon,
  Comment as CommentIcon,
  Link as LinkIcon,
  DataUsage as DataIcon,
  ExpandMore as ExpandMoreIcon,
  Sort as SortIcon,
  Storage as ProcedureIcon,
  Functions as FunctionIcon,
  Storage as StorageIcon,
  Storage as DatabaseIcon,
  Code as DdlIcon,
  AccountTree as DependenciesIcon
} from '@mui/icons-material';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import logger from '../utils/logger';

// Hook personnalisé pour le debouncing
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const Search = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [databases, setDatabases] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [advancedMode] = useState(true);
  const [selectedObjectTypes, setSelectedObjectTypes] = useState(['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION']);
  const [searchMode, setSearchMode] = useState('fast'); // 'fast' ou 'complete'
  const [orderBy, setOrderBy] = useState('object_name');
  const [order, setOrder] = useState('asc');
  const [ddlDialogOpen, setDdlDialogOpen] = useState(false);
  const [ddlContent, setDdlContent] = useState('');
  const [ddlLoading, setDdlLoading] = useState(false);
  const [selectedObject, setSelectedObject] = useState(null);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [selectedObjectForComment, setSelectedObjectForComment] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [existingComment, setExistingComment] = useState(null);
  const [existingComments, setExistingComments] = useState(new Map());
  const [copySuccess, setCopySuccess] = useState(false);
  const [sqlCopySuccess, setSqlCopySuccess] = useState(false);
  const [csvExportSuccess, setCsvExportSuccess] = useState(false);
  const [dependenciesDialogOpen, setDependenciesDialogOpen] = useState(false);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [dependencies, setDependencies] = useState([]);
  const [selectedObjectForDependencies, setSelectedObjectForDependencies] = useState(null);
  const [dependencyDdlDialogOpen, setDependencyDdlDialogOpen] = useState(false);
  const [dependencyDdlContent, setDependencyDdlContent] = useState('');
  const [dependencyDdlLoading, setDependencyDdlLoading] = useState(false);
  const [selectedDependency, setSelectedDependency] = useState(null);
  const [dataDialogOpen, setDataDialogOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [tableData, setTableData] = useState({ columns: [], data: [] });
  const [selectedTable, setSelectedTable] = useState(null);
  const [dataPage, setDataPage] = useState(0);
  const [dataRowsPerPage, setDataRowsPerPage] = useState(10);
  const fetchDbRequestId = useRef(0);
  
  // Debouncing pour la recherche automatique
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const objectTypes = [
    { value: 'TABLE', label: 'Tables', icon: <TableIcon /> },
    { value: 'VIEW', label: 'Vues', icon: <ViewIcon /> },
    { value: 'PROCEDURE', label: 'Procédures', icon: <ProcedureIcon /> },
    { value: 'FUNCTION', label: 'Fonctions', icon: <FunctionIcon /> },
  ];

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      fetchDatabases(selectedConnection);
    } else {
      setDatabases([]);
      setSelectedDatabase('');
    }
  }, [selectedConnection]);

  const fetchConnections = async () => {
    try {
      const response = await connectionsAPI.getActive();
      setConnections(response.data);
    } catch (err) {
      setError('Erreur lors du chargement des connexions');
    }
  };

  const fetchDatabases = async (connectionId) => {
    const requestId = ++fetchDbRequestId.current;
            logger.api('Récupération des bases de données pour la connexion', { connectionId, requestId });
    try {
      const response = await connectionsAPI.getDatabases(connectionId);
              logger.api('Réponse des bases de données reçue', { connectionId, data: response.data });
      if (fetchDbRequestId.current === requestId) {
        setDatabases(response.data || []);
                  logger.api('Bases de données mises à jour', { connectionId, data: response.data });
      }
    } catch (err) {
      console.error('Erreur lors de la récupération des bases de données pour la connexion', connectionId, ':', err);
      if (fetchDbRequestId.current === requestId) {
        setDatabases([]);
      }
    }
  };

  // Recherche optimisée avec useCallback
  const handleSearch = useCallback(async (searchTermToUse = searchTerm) => {
    // Ensure searchTermToUse is a string before calling trim()
    const searchTermString = String(searchTermToUse || '');
    if (!searchTermString.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const searchData = {
        searchTerm: searchTermString.trim(),
        connectionId: selectedConnection || null,
        databaseName: selectedDatabase || null,
        searchMode: searchMode,
      };

      if (advancedMode) {
        searchData.connectionIds = selectedConnection ? [selectedConnection] : null;
        searchData.databaseNames = selectedDatabase ? [selectedDatabase] : null;
        searchData.objectTypes = selectedObjectTypes;
      }

      const response = advancedMode 
        ? await searchAPI.searchAdvanced(searchData)
        : await searchAPI.search(searchData);

      setResults(response.data.results || []);
      
      // Charger les commentaires existants pour les résultats
      await loadExistingComments(response.data.results || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la recherche');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedConnection, selectedDatabase, searchMode, advancedMode, selectedObjectTypes]);

  // Recherche automatique avec debouncing
  useEffect(() => {
    if (debouncedSearchTerm.trim().length >= 2) {
      handleSearch(debouncedSearchTerm);
    } else if (debouncedSearchTerm.trim().length === 0) {
      setResults([]);
    }
  }, [debouncedSearchTerm, handleSearch]);

  const handleObjectTypeChange = (type) => {
    setSelectedObjectTypes(prev => 
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handleViewDDL = async (result) => {
    try {
      setSelectedObject(result);
      setDdlDialogOpen(true);
      setDdlLoading(true);
      setDdlContent('');

      const response = await searchAPI.getDDL(
        result.connection_id,
        result.database_name,
        result.object_type,
        result.object_name,
        result.schema_name
      );

      setDdlContent(response.data.ddl);
    } catch (error) {
      console.error('Erreur lors de la récupération du DDL:', error);
      setDdlContent('Erreur lors de la récupération du DDL: ' + error.message);
    } finally {
      setDdlLoading(false);
    }
  };

  const handleViewDependencies = async (result) => {
    try {
      setSelectedObjectForDependencies(result);
      setDependenciesDialogOpen(true);
      setDependenciesLoading(true);
      setDependencies([]);

      const response = await searchAPI.getDependencies(
        result.connection_id,
        result.database_name,
        result.object_type,
        result.object_name,
        result.schema_name
      );

      setDependencies(response.data.dependencies || []);
    } catch (error) {
      console.error('Erreur lors de la récupération des dépendances:', error);
      setDependencies([]);
    } finally {
      setDependenciesLoading(false);
    }
  };

  const handleViewDependencyDDL = async (dependency) => {
    try {
      setSelectedDependency(dependency);
      setDependencyDdlDialogOpen(true);
      setDependencyDdlLoading(true);
      setDependencyDdlContent('');

      const response = await searchAPI.getDDL(
        selectedObjectForDependencies.connection_id,
        selectedObjectForDependencies.database_name,
        dependency.dependency_type,
        dependency.dependency_name,
        dependency.parent_schema
      );

      setDependencyDdlContent(response.data.ddl);
    } catch (error) {
      console.error('Erreur lors de la récupération du DDL de la dépendance:', error);
      setDependencyDdlContent('Erreur lors de la récupération du DDL: ' + error.message);
    } finally {
      setDependencyDdlLoading(false);
    }
  };

  const handleViewTableData = async (result) => {
    try {
      setSelectedTable(result);
      setDataDialogOpen(true);
      setDataLoading(true);
      setTableData({ columns: [], data: [] });
      setDataPage(0);

      const response = await searchAPI.getTableData(
        result.connection_id,
        result.database_name,
        result.object_name,
        result.schema_name,
        200
      );

      setTableData(response.data || response);
    } catch (error) {
      console.error('Erreur lors de la récupération des données:', error);
      setTableData({ columns: [], data: [] });
    } finally {
      setDataLoading(false);
    }
  };

  const handleAddComment = async (result) => {
    const commentData = {
      connection_id: result.connection_id,
      database_name: result.database_name,
      object_type: result.object_type,
      object_name: result.object_name,
      schema_name: result.schema_name || '',
    };
    
    setSelectedObjectForComment(commentData);
    setCommentText('');
    setExistingComment(null);
    
    try {
      // Essayer de récupérer le commentaire existant
      const response = await commentsAPI.getByObject(
        result.connection_id,
        result.database_name,
        result.object_type,
        result.object_name,
        result.schema_name
      );
      
      if (response.data && response.data.length > 0) {
        const existing = response.data[0];
        setExistingComment(existing);
        setCommentText(existing.comment);
      }
    } catch (error) {
              logger.info('Aucun commentaire existant trouvé');
    }
    
    setCommentDialogOpen(true);
  };

  const handleSaveComment = async () => {
    if (!commentText.trim() || !selectedObjectForComment) return;

    setCommentLoading(true);
    try {
      const commentData = {
        ...selectedObjectForComment,
        comment: commentText.trim()
      };

      if (existingComment) {
        // Mettre à jour le commentaire existant
        await commentsAPI.update(existingComment.id, { comment: commentText.trim() });
      } else {
        // Créer un nouveau commentaire
        await commentsAPI.create(commentData);
      }
      
      // Mettre à jour la liste des commentaires existants
      const key = `${selectedObjectForComment.connection_id}-${selectedObjectForComment.database_name}-${selectedObjectForComment.object_type}-${selectedObjectForComment.object_name}-${selectedObjectForComment.schema_name}`;
      setExistingComments(prev => new Map(prev.set(key, true)));
      
      // Fermer le dialogue et réinitialiser
      setCommentDialogOpen(false);
      setCommentText('');
      setSelectedObjectForComment(null);
      setExistingComment(null);
      
      // Optionnel : Afficher un message de succès
              logger.info('Commentaire sauvegardé avec succès');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du commentaire:', error);
      // Optionnel : Afficher un message d'erreur
    } finally {
      setCommentLoading(false);
    }
  };

  const hasComment = (result) => {
    const key = `${result.connection_id}-${result.database_name}-${result.object_type}-${result.object_name}-${result.schema_name}`;
    return existingComments.has(key);
  };

  // Cache pour les commentaires
  const commentsCache = useRef(new Map());
  
  const loadExistingComments = useCallback(async (results) => {
    if (!results || results.length === 0) return;

    const commentsMap = new Map();
    const uncachedResults = [];
    
    // Vérifier le cache d'abord
    for (const result of results) {
      const cacheKey = `${result.connection_id}-${result.database_name}-${result.object_type}-${result.object_name}-${result.schema_name}`;
      const cachedComment = commentsCache.current.get(cacheKey);
      
      if (cachedComment) {
        commentsMap.set(cacheKey, cachedComment);
      } else {
        uncachedResults.push({ result, cacheKey });
      }
    }
    
    // Charger uniquement les commentaires non cachés en parallèle
    const promises = uncachedResults.map(async ({ result, cacheKey }) => {
      try {
        const response = await commentsAPI.getByObject(
          result.connection_id,
          result.database_name,
          result.object_type,
          result.object_name,
          result.schema_name
        );
        
        if (response.data && response.data.length > 0) {
          const comment = response.data[0];
          commentsMap.set(cacheKey, comment);
          commentsCache.current.set(cacheKey, comment);
        }
      } catch (err) {
        console.warn('Erreur lors du chargement du commentaire:', err);
      }
    });
    
    // Attendre tous les chargements en parallèle
    await Promise.all(promises);
    
    setExistingComments(commentsMap);
  }, []);

  const handleCopyDDL = async () => {
    try {
      await navigator.clipboard.writeText(ddlContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000); // Reset après 2 secondes
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
      // Fallback pour les navigateurs plus anciens
      const textArea = document.createElement('textarea');
      textArea.value = ddlContent;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortResults = (results, orderBy, order) => {
    return results.sort((a, b) => {
      let aValue = a[orderBy];
      let bValue = b[orderBy];
      
      // Gestion des valeurs nulles/undefined
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';
      
      // Conversion en string pour la comparaison
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();
      
      if (order === 'desc') {
        return bValue.localeCompare(aValue);
      } else {
        return aValue.localeCompare(bValue);
      }
    });
  };

  const getObjectIcon = (type) => {
    switch (type) {
      case 'TABLE': return <TableIcon />;
      case 'VIEW': return <ViewIcon />;
      case 'PROCEDURE': return <ProcedureIcon />;
      case 'FUNCTION': return <FunctionIcon />;
      default: return <StorageIcon />;
    }
  };

  const getObjectTypeLabel = (type) => {
    switch (type) {
      case 'TABLE': return 'Table';
      case 'VIEW': return 'Vue';
      case 'PROCEDURE': return 'Procédure';
      case 'FUNCTION': return 'Fonction';
      default: return type;
    }
  };

  const getConnectionTypeColor = (type) => {
    switch (type) {
      case 'sqlserver': return 'primary';
      case 'mysql': return 'success';
      case 'mariadb': return 'warning';
      default: return 'default';
    }
  };

  const groupResultsByConnection = (results) => {
    const grouped = {};
    results.forEach(result => {
      const key = result.connection_id;
      if (!grouped[key]) {
        grouped[key] = {
          connection: {
            id: result.connection_id,
            name: result.connection_name,
            type: result.connection_type,
          },
          databases: {},
        };
      }
      
      const dbKey = result.database_name;
      if (!grouped[key].databases[dbKey]) {
        grouped[key].databases[dbKey] = [];
      }
      
      grouped[key].databases[dbKey].push(result);
    });

    // Trier les résultats dans chaque base de données
    Object.values(grouped).forEach(group => {
      Object.values(group.databases).forEach(dbResults => {
        sortResults(dbResults, orderBy, order);
      });
    });

    return grouped;
  };

  const groupedResults = groupResultsByConnection(results);

  // Fonction pour formater les valeurs des cellules
  const formatCellValue = (value) => {
    if (value === null || value === undefined) {
      return <em style={{ color: '#999' }}>NULL</em>;
    }
    if (typeof value === 'boolean') {
      return value ? 'Oui' : 'Non';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  // Fonction pour formater les types de données
  const formatDataType = (column) => {
    // Si le type est 'varchar' (type par défaut), on ne l'affiche pas
    if (column.data_type === 'varchar' && !column.precision && !column.max_length) {
      return null; // Retourne null pour masquer le type
    }
    
    let type = column.data_type || 'unknown';
    
    // Ajouter la précision pour les types numériques
    if (column.precision && column.scale) {
      type += `(${column.precision},${column.scale})`;
    } else if (column.max_length && column.max_length > 0) {
      // Pour les types de caractères
      if (column.max_length === -1) {
        type += '(max)';
      } else {
        type += `(${column.max_length})`;
      }
    }
    
    return type;
  };

  // Fonction pour générer le contenu CSV
  const generateCSV = (columns, data) => {
    if (!data || data.length === 0) return '';
    
    // En-têtes
    const headers = columns.map(col => col.column_name).join(',');
    
    // Données
    const rows = data.map(row => 
      columns.map(col => {
        const value = row[col.column_name];
        // Échapper les virgules et guillemets dans les valeurs CSV
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    ).join('\n');
    
    return `${headers}\n${rows}`;
  };

  const generateSQLQuery = (table, limit = 200) => {
    if (!table) return '';
    
    const { object_name, schema_name, database_name } = table;
    const schema = schema_name || 'dbo';
    
    // Construire la requête SQL selon le type de base de données
    // On peut détecter le type via selectedTable.connection_type
    if (table.connection_type === 'mysql' || table.connection_type === 'mariadb') {
      return `SELECT * FROM ${database_name}.${object_name}\nLIMIT ${limit};`;
    } else {
      // SQL Server par défaut
      return `SELECT TOP ${limit} *\nFROM ${database_name}.${schema}.${object_name}\nORDER BY (SELECT NULL);`;
    }
  };

  // Fonctions d'export CSV pour les résultats de recherche
  const generateSearchResultsCSV = (results) => {
    if (!results || results.length === 0) return '';
    
    const headers = [
      'Type',
      'Nom',
      'Schéma',
      'Base de données',
      'Serveur',
      'Description'
    ].join(',');
    
    const rows = results.map(result => [
      getObjectTypeLabel(result.object_type),
      result.object_name,
      result.schema_name || '',
      result.database_name,
      result.connection_name,
      result.description
    ].map(value => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(','));
    
    return `${headers}\n${rows.join('\n')}`;
  };

  const handleExportGlobalCSV = () => {
    const csvContent = generateSearchResultsCSV(results);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recherche_globale_${searchTerm}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setCsvExportSuccess(true);
    setTimeout(() => setCsvExportSuccess(false), 2000);
  };

  const handleExportServerCSV = (connectionId, connectionName) => {
    const serverResults = results.filter(result => result.connection_id === connectionId);
    const csvContent = generateSearchResultsCSV(serverResults);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recherche_${connectionName}_${searchTerm}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setCsvExportSuccess(true);
    setTimeout(() => setCsvExportSuccess(false), 2000);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Recherche
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                label="Terme de recherche"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch(searchTerm)}
                placeholder="Nom de table, procédure, fonction..."
              />
            </Grid>
            
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Connexion</InputLabel>
                <Select
                  value={selectedConnection}
                  onChange={(e) => {
                    logger.ui('Connexion sélectionnée', { value: e.target.value });
                    setSelectedConnection(e.target.value);
                  }}
                  label="Connexion"
                >
                  <MenuItem value="">Toutes les connexions</MenuItem>
                  {connections.map((conn) => (
                    <MenuItem key={conn.id} value={conn.id}>
                      {conn.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <FormControl fullWidth disabled={!selectedConnection} size="small">
                <InputLabel>Base de données</InputLabel>
                <Select
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                  label="Base de données"
                >
                  <MenuItem value="">Toutes les bases</MenuItem>
                  {databases.map((db) => (
                    <MenuItem key={db} value={db}>
                      {db}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={() => handleSearch(searchTerm)}
                disabled={loading || !searchTerm.trim()}
              >
                {loading ? 'Recherche...' : 'Rechercher'}
              </Button>
            </Grid>
          </Grid>

          {advancedMode && (
            <Box mt={2}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Types d'objets à rechercher :
                  </Typography>
                  <Grid container spacing={1}>
                    {objectTypes.map((type) => (
                      <Grid item key={type.value}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedObjectTypes.includes(type.value)}
                              onChange={() => handleObjectTypeChange(type.value)}
                              icon={type.icon}
                              checkedIcon={type.icon}
                            />
                          }
                          label={type.label}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Mode de recherche :
                  </Typography>
                  <FormControl component="fieldset">
                    <Grid container spacing={2}>
                      <Grid item>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={searchMode === 'fast'}
                              onChange={() => setSearchMode('fast')}
                              color="primary"
                            />
                          }
                          label="Rapide (noms seulement)"
                        />
                      </Grid>
                      <Grid item>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={searchMode === 'complete'}
                              onChange={() => setSearchMode('complete')}
                              color="secondary"
                            />
                          }
                          label="Complète (avec code DDL)"
                        />
                      </Grid>
                    </Grid>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {results.length > 0 && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Résultats ({results.length} objets trouvés)
            </Typography>
            <Button
              onClick={handleExportGlobalCSV}
              disabled={results.length === 0}
              color={csvExportSuccess ? "success" : "primary"}
              variant={csvExportSuccess ? "contained" : "outlined"}
              size="small"
              startIcon={<CopyIcon />}
            >
              {csvExportSuccess ? "Exporté !" : "Export CSV Global"}
            </Button>
          </Box>

                      {Object.values(groupedResults).map((group) => (
            <Accordion key={group.connection.id} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center" width="100%">
                  <Chip
                    label={group.connection.type.toUpperCase()}
                    color={getConnectionTypeColor(group.connection.type)}
                    size="small"
                    sx={{ mr: 2 }}
                  />
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    {group.connection.name}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Typography variant="body2" color="textSecondary">
                      {Object.values(group.databases).flat().length} objets
                    </Typography>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportServerCSV(group.connection.id, group.connection.name);
                      }}
                      disabled={Object.values(group.databases).flat().length === 0}
                      color={csvExportSuccess ? "success" : "primary"}
                      variant={csvExportSuccess ? "contained" : "outlined"}
                      size="small"
                      startIcon={<CopyIcon />}
                      sx={{ minWidth: 'auto' }}
                    >
                      {csvExportSuccess ? "Exporté !" : "Export CSV"}
                    </Button>
                  </Box>
                </Box>
              </AccordionSummary>
              
              <AccordionDetails>
                {Object.entries(group.databases).map(([dbName, dbResults]) => (
                  <Box key={dbName} mb={3}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                      <DatabaseIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                      {dbName}
                    </Typography>
                    
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>
                              <TableSortLabel
                                active={orderBy === 'object_type'}
                                direction={orderBy === 'object_type' ? order : 'asc'}
                                onClick={() => handleRequestSort('object_type')}
                              >
                                Type
                              </TableSortLabel>
                            </TableCell>
                            <TableCell>
                              <TableSortLabel
                                active={orderBy === 'object_name'}
                                direction={orderBy === 'object_name' ? order : 'asc'}
                                onClick={() => handleRequestSort('object_name')}
                              >
                                Nom
                              </TableSortLabel>
                            </TableCell>
                            <TableCell>
                              <TableSortLabel
                                active={orderBy === 'schema_name'}
                                direction={orderBy === 'schema_name' ? order : 'asc'}
                                onClick={() => handleRequestSort('schema_name')}
                              >
                                Schéma
                              </TableSortLabel>
                            </TableCell>
                            <TableCell>
                              <TableSortLabel
                                active={orderBy === 'description'}
                                direction={orderBy === 'description' ? order : 'asc'}
                                onClick={() => handleRequestSort('description')}
                              >
                                Description
                              </TableSortLabel>
                            </TableCell>
                            <TableCell>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {dbResults.map((result, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Box display="flex" alignItems="center">
                                  {getObjectIcon(result.object_type)}
                                  <Typography variant="body2" sx={{ ml: 1 }}>
                                    {getObjectTypeLabel(result.object_type)}
                                  </Typography>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                  {result.object_name}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" color="textSecondary">
                                  {result.schema_name || '-'}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Box display="flex" alignItems="center" gap={1}>
                                  {result.description.includes('contient colonne:') && (
                                    <Chip
                                      label="Colonne"
                                      size="small"
                                      color="warning"
                                      variant="outlined"
                                    />
                                  )}
                                  {result.description.includes('définition contient') && (
                                    <Chip
                                      label="Définition"
                                      size="small"
                                      color="info"
                                      variant="outlined"
                                    />
                                  )}
                                  {result.description.includes('code contient') && (
                                    <Chip
                                      label="Code"
                                      size="small"
                                      color="info"
                                      variant="outlined"
                                    />
                                  )}
                                  <Typography variant="body2" color="textSecondary">
                                    {result.description}
                                  </Typography>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Box display="flex" gap={1}>
                                  <Tooltip title="Voir le code DDL">
                                    <IconButton
                                      size="small"
                                      color="secondary"
                                      onClick={() => handleViewDDL(result)}
                                    >
                                      <DdlIcon />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Voir les dépendances">
                                    <IconButton
                                      size="small"
                                      color="info"
                                      onClick={() => handleViewDependencies(result)}
                                    >
                                      <DependenciesIcon />
                                    </IconButton>
                                  </Tooltip>
                                  {result.object_type === 'TABLE' && (
                                    <Tooltip title="Voir les données">
                                      <IconButton
                                        size="small"
                                        color="success"
                                        onClick={() => handleViewTableData(result)}
                                      >
                                        <DataIcon />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  <Tooltip title={hasComment(result) ? "Modifier le commentaire" : "Ajouter un commentaire"}>
                                    <IconButton
                                      size="small"
                                      color={hasComment(result) ? "success" : "primary"}
                                      onClick={() => handleAddComment(result)}
                                      sx={{
                                        position: 'relative',
                                        '&::after': hasComment(result) ? {
                                          content: '""',
                                          position: 'absolute',
                                          top: 2,
                                          right: 2,
                                          width: 8,
                                          height: 8,
                                          borderRadius: '50%',
                                          backgroundColor: 'success.main',
                                          border: '2px solid white'
                                        } : {}
                                      }}
                                    >
                                      <CommentIcon />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {!loading && results.length === 0 && searchTerm && (
        <Box textAlign="center" py={4}>
          <Typography variant="h6" color="textSecondary">
            Aucun résultat trouvé
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Essayez de modifier vos critères de recherche
          </Typography>
        </Box>
      )}

      {/* Dialogue DDL */}
      <Dialog
        open={ddlDialogOpen}
        onClose={() => setDdlDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              Code DDL - {selectedObject?.object_name}
              <Typography variant="body2" color="textSecondary">
                {selectedObject?.database_name} • {selectedObject?.object_type} • {selectedObject?.schema_name}
              </Typography>
            </Box>
            <Button 
              onClick={handleCopyDDL}
              startIcon={<CopyIcon />}
              color={copySuccess ? "success" : "primary"}
              variant={copySuccess ? "contained" : "outlined"}
              size="small"
            >
              {copySuccess ? "Copié !" : "Copier"}
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {ddlLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" py={4}>
              <LinearProgress sx={{ width: '100%', mb: 2 }} />
              <Typography variant="body2" color="textSecondary" align="center">
                Récupération du code DDL en cours...<br/>
                Cela peut prendre quelques secondes si la connexion est distante ou via SSH.
              </Typography>
            </Box>
          ) : (
            <SyntaxHighlighter
              language="sql"
              style={tomorrow}
              customStyle={{
                backgroundColor: '#2d2d2d',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            >
              {ddlContent}
            </SyntaxHighlighter>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDdlDialogOpen(false)}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue Commentaire */}
      <Dialog
        open={commentDialogOpen}
        onClose={() => setCommentDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {existingComment ? 'Modifier le commentaire' : 'Ajouter un commentaire'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Objet : {selectedObjectForComment?.object_name} ({selectedObjectForComment?.object_type})
            </Typography>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Base de données : {selectedObjectForComment?.database_name}
              {selectedObjectForComment?.schema_name && ` • Schéma : ${selectedObjectForComment.schema_name}`}
            </Typography>
            <TextField
              fullWidth
              label="Commentaire"
              multiline
              rows={4}
              placeholder="Ajoutez votre commentaire ici..."
              sx={{ mt: 2 }}
              autoFocus
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommentDialogOpen(false)}>
            Annuler
          </Button>
          <Button variant="contained" onClick={handleSaveComment} disabled={commentLoading}>
            {commentLoading ? 'Sauvegarde...' : (existingComment ? 'Modifier' : 'Sauvegarder')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue Dépendances */}
      <Dialog
        open={dependenciesDialogOpen}
        onClose={() => setDependenciesDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <DependenciesIcon />
            <Box>
              <Typography variant="h6">
                Dépendances - {selectedObjectForDependencies?.object_name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {selectedObjectForDependencies?.database_name} • {selectedObjectForDependencies?.object_type} • {selectedObjectForDependencies?.schema_name}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {dependenciesLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" py={4}>
              <LinearProgress sx={{ width: '100%', mb: 2 }} />
              <Typography variant="body2" color="textSecondary" align="center">
                Récupération des dépendances en cours...<br/>
                Cela peut prendre quelques secondes si la connexion est distante ou via SSH.
              </Typography>
            </Box>
          ) : dependencies.length > 0 ? (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                {dependencies.length} objet(s) qui utilisent ou référencent cet objet
              </Alert>
              
              <List>
                {dependencies.map((dependency, index) => (
                  <React.Fragment key={index}>
                    <ListItem>
                      <ListItemIcon>
                        {getObjectIcon(dependency.dependency_type)}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body1" fontWeight="medium">
                              {dependency.dependency_name}
                            </Typography>
                            <Chip
                              label={getObjectTypeLabel(dependency.dependency_type)}
                              size="small"
                              color={getConnectionTypeColor(selectedObjectForDependencies?.connection_type)}
                              variant="outlined"
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Schéma : {dependency.parent_schema || 'N/A'} • Table : {dependency.parent_table}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              {dependency.description}
                            </Typography>
                          </Box>
                        }
                      />
                      <Box display="flex" gap={1}>
                        <Tooltip title="Voir le code DDL">
                          <IconButton
                            size="small"
                            color="secondary"
                            onClick={() => handleViewDependencyDDL(dependency)}
                          >
                            <DdlIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </ListItem>
                    {index < dependencies.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </Box>
          ) : (
            <Box textAlign="center" py={4}>
              <DependenciesIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="textSecondary" gutterBottom>
                Aucune dépendance trouvée
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Cet objet n'est référencé par aucun autre objet dans la base de données
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDependenciesDialogOpen(false)}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue DDL de la Dépendance */}
      <Dialog
        open={dependencyDdlDialogOpen}
        onClose={() => setDependencyDdlDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">
                Code DDL - {selectedDependency?.dependency_name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {selectedObjectForDependencies?.database_name} • {selectedDependency?.dependency_type} • {selectedDependency?.parent_schema}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Dépendance de : {selectedObjectForDependencies?.object_name}
              </Typography>
            </Box>
            <Button 
              onClick={() => {
                navigator.clipboard.writeText(dependencyDdlContent);
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000);
              }}
              startIcon={<CopyIcon />}
              color={copySuccess ? "success" : "primary"}
              variant={copySuccess ? "contained" : "outlined"}
              size="small"
            >
              {copySuccess ? "Copié !" : "Copier"}
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {dependencyDdlLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" py={4}>
              <LinearProgress sx={{ width: '100%', mb: 2 }} />
              <Typography variant="body2" color="textSecondary" align="center">
                Récupération du code DDL de la dépendance en cours...<br/>
                Cela peut prendre quelques secondes si la connexion est distante ou via SSH.
              </Typography>
            </Box>
          ) : (
            <SyntaxHighlighter
              language="sql"
              style={tomorrow}
              customStyle={{
                backgroundColor: '#2d2d2d',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            >
              {dependencyDdlContent}
            </SyntaxHighlighter>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDependencyDdlDialogOpen(false)}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue Données de la Table */}
      <Dialog
        open={dataDialogOpen}
        onClose={() => setDataDialogOpen(false)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">
                Données - {selectedTable?.object_name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {selectedTable?.database_name} • {selectedTable?.schema_name} • {tableData.total} lignes (limité à 200)
              </Typography>
            </Box>
            <Box display="flex" gap={1}>
              <Button 
                onClick={() => {
                  const sqlQuery = generateSQLQuery(selectedTable, 200);
                  navigator.clipboard.writeText(sqlQuery);
                  setSqlCopySuccess(true);
                  setTimeout(() => setSqlCopySuccess(false), 2000);
                }}
                startIcon={<CodeIcon />}
                color={sqlCopySuccess ? "success" : "secondary"}
                variant={sqlCopySuccess ? "contained" : "outlined"}
                size="small"
              >
                {sqlCopySuccess ? "Copié !" : "Copier SQL"}
              </Button>
              <Button 
                onClick={() => {
                  const csvContent = generateCSV(tableData.columns, tableData.data);
                  navigator.clipboard.writeText(csvContent);
                  setCsvExportSuccess(true);
                  setTimeout(() => setCsvExportSuccess(false), 2000);
                }}
                startIcon={<CopyIcon />}
                color={csvExportSuccess ? "success" : "primary"}
                variant={csvExportSuccess ? "contained" : "outlined"}
                size="small"
              >
                {csvExportSuccess ? "Exporté !" : "Export CSV"}
              </Button>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {dataLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" py={4}>
              <LinearProgress sx={{ width: '100%', mb: 2 }} />
              <Typography variant="body2" color="textSecondary" align="center">
                Récupération des données de la table en cours...<br/>
                Cela peut prendre quelques secondes si la connexion est distante ou via SSH.
              </Typography>
            </Box>
          ) : tableData.data.length > 0 ? (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                Affichage des {tableData.data.length} premières lignes • {tableData.columns.length} colonnes • Utilisez le scroll horizontal pour voir toutes les colonnes
              </Alert>
              
              <TableContainer 
                component={Paper} 
                variant="outlined" 
                sx={{ 
                  maxHeight: 600,
                  overflowX: 'auto',
                  '& .MuiTable-root': {
                    minWidth: 650, // Largeur minimale pour forcer le scroll horizontal
                  }
                }}
              >
                <Table size="small" stickyHeader>
                                      <TableHead>
                      <TableRow>
                        {tableData.columns.map((column, index) => (
                          <TableCell 
                            key={index} 
                            sx={{ 
                              fontWeight: 'bold', 
                              backgroundColor: 'grey.100',
                              minWidth: 150, // Largeur minimale pour les colonnes
                              whiteSpace: 'nowrap', // Empêche le retour à la ligne
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            <Box>
                              <Typography variant="body2" fontWeight="bold" noWrap>
                                {column.column_name}
                              </Typography>
                              {formatDataType(column) && (
                                <Typography variant="caption" color="textSecondary" noWrap>
                                  {formatDataType(column)}
                                </Typography>
                              )}
                              {column.is_primary_key === 1 && (
                                <Chip label="PK" size="small" color="primary" sx={{ ml: 1, height: 16 }} />
                              )}
                              {/* Debug: {JSON.stringify(column)} */}
                            </Box>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                                          <TableBody>
                          {tableData.data
                            .slice(dataPage * dataRowsPerPage, dataPage * dataRowsPerPage + dataRowsPerPage)
                            .map((row, rowIndex) => (
                              <TableRow key={rowIndex} hover>
                                {tableData.columns.map((column, colIndex) => (
                                  <TableCell 
                                    key={colIndex}
                                    sx={{
                                      minWidth: 150, // Même largeur minimale que les en-têtes
                                      maxWidth: 300, // Largeur maximale pour éviter les colonnes trop larges
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                  >
                                    <Typography variant="body2" noWrap title={String(row[column.column_name] || '')}>
                                      {formatCellValue(row[column.column_name])}
                                    </Typography>
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                        </TableBody>
                </Table>
              </TableContainer>
              
              <TablePagination
                component="div"
                count={tableData.data.length}
                page={dataPage}
                onPageChange={(event, newPage) => setDataPage(newPage)}
                rowsPerPage={dataRowsPerPage}
                onRowsPerPageChange={(event) => {
                  setDataRowsPerPage(parseInt(event.target.value, 10));
                  setDataPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25, 50]}
                labelRowsPerPage="Lignes par page"
                labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
              />
            </Box>
          ) : (
            <Box textAlign="center" py={4}>
              <DataIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="textSecondary" gutterBottom>
                Aucune donnée trouvée
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Cette table ne contient aucune donnée ou une erreur s'est produite
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDataDialogOpen(false)}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Search; 