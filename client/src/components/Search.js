import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent, Grid, 
  FormControl, InputLabel, Select, MenuItem, Chip, CircularProgress,
  Alert, Table, TableBody, TableCell, TableContainer, TableHead, 
  TableRow, Paper, IconButton, Tooltip, Dialog, DialogTitle, 
  DialogContent, DialogActions, DialogContentText, TextareaAutosize,
  FormControlLabel, Checkbox, Accordion, AccordionSummary, 
  AccordionDetails, TablePagination, Snackbar, LinearProgress,
  TableSortLabel, List, ListItem, ListItemIcon, ListItemText, Divider,
  Stack
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
  AccountTree as DependenciesIcon,
  IntegrationInstructions as DtsxIcon,
  Work as JobIcon,
  Folder as FolderIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  PlayArrow as PlayArrowIcon
} from '@mui/icons-material';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import logger from '../utils/logger';


// Hook de debouncing supprimé - recherche uniquement manuelle
// const useDebounce = (value, delay) => {
//   const [debouncedValue, setDebouncedValue] = useState(value);
//   useEffect(() => {
//     const handler = setTimeout(() => {
//       setDebouncedValue(value);
//     }, delay);
//     return () => {
//       clearTimeout(handler);
//     };
//   }, [value, delay]);
//   return debouncedValue;
// };

const Search = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [databases, setDatabases] = useState([]);
  const [results, setResults] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [error, setError] = useState(null);
  const [advancedMode, setAdvancedMode] = useState(true);
  const [selectedObjectTypes, setSelectedObjectTypes] = useState(['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION']);
  const [isDtsxAvailable, setIsDtsxAvailable] = useState(false);

  // Vérifier si la recherche DTSX est disponible
  useEffect(() => {
    fetch('/api/search/dtsx-available')
      .then(response => response.json())
      .then(data => {
        setIsDtsxAvailable(data.available);
      })
      .catch(() => {
        setIsDtsxAvailable(false);
      });
  }, []);
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
  const [dtsxResults, setDtsxResults] = useState([]);
  const [dtsxLoading, setDtsxLoading] = useState(false);
  const [dtsxOrderBy, setDtsxOrderBy] = useState('object_name');
  const [dtsxOrder, setDtsxOrder] = useState('asc');
  const [dtsxDetailsDialogOpen, setDtsxDetailsDialogOpen] = useState(false);
  const [dtsxDetailsLoading, setDtsxDetailsLoading] = useState(false);
  const [dtsxDetails, setDtsxDetails] = useState(null);
  const [selectedDtsx, setSelectedDtsx] = useState(null);

  const fetchDbRequestId = useRef(0);
  
  // Debouncing supprimé - recherche uniquement manuelle
  // const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const baseObjectTypes = [
    { value: 'TABLE', label: 'Tables', icon: <TableIcon /> },
    { value: 'VIEW', label: 'Vues', icon: <ViewIcon /> },
    { value: 'PROCEDURE', label: 'Procédures', icon: <ProcedureIcon /> },
    { value: 'FUNCTION', label: 'Fonctions', icon: <FunctionIcon /> },
  ];

    const objectTypes = isDtsxAvailable
    ? [...baseObjectTypes, { value: 'DTSX_PACKAGE', label: 'Packages DTSX', icon: <DtsxIcon /> }]
    : baseObjectTypes;

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
      const response = await connectionsAPI.getActiveConnections();
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

    // Vérifier si au moins un type d'objet est sélectionné en mode avancé
    if (advancedMode && selectedObjectTypes.length === 0) {
      setResults([]);
      setDtsxResults([]);
      setError('Veuillez sélectionner au moins un type d\'objet à rechercher');
      return;
    }

    // Replier automatiquement la section avancée lors d'une recherche
    if (advancedMode) {
      setAdvancedMode(false);
    }

    setError(null);
    setResults([]);

    // Vérifier s'il y a des types d'objets autres que DTSX sélectionnés
    const nonDtsxTypes = selectedObjectTypes.filter(type => type !== 'DTSX_PACKAGE');
    const hasNonDtsxTypes = nonDtsxTypes.length > 0;

    // Recherche des objets de base de données seulement si des types autres que DTSX sont sélectionnés
    if (!advancedMode || hasNonDtsxTypes) {
      setDbLoading(true);
      try {
        const searchData = {
          searchTerm: searchTermString.trim(),
          connectionId: selectedConnection || null,
          databaseName: selectedDatabase || null,
          searchMode: searchMode,
          includeDtsx: false
        };

        if (advancedMode) {
          searchData.connectionIds = selectedConnection ? [selectedConnection] : null;
          searchData.databaseNames = selectedDatabase ? [selectedDatabase] : null;
          searchData.objectTypes = nonDtsxTypes;
        }

        const response = await (advancedMode ? searchAPI.searchAdvanced(searchData) : searchAPI.search(searchData));
        setResults(response.data.results || []);
        
        // Charger les commentaires existants pour les résultats
        await loadExistingComments(response.data.results || []);
      } catch (err) {
        setError(err.response?.data?.error || 'Erreur lors de la recherche');
      } finally {
        setDbLoading(false);
      }
    }

    // Recherche DTSX si activée, disponible et sélectionnée
    if (isDtsxAvailable && selectedObjectTypes.includes('DTSX_PACKAGE')) {
      setDtsxLoading(true);
      try {
        const dtsxSearchData = {
          searchTerm: searchTermString.trim(),
          connectionId: selectedConnection || null,
          databaseName: selectedDatabase || null,
          searchMode: searchMode,
          includeDtsx: true
        };

        if (advancedMode) {
          dtsxSearchData.connectionIds = selectedConnection ? [selectedConnection] : null;
          dtsxSearchData.databaseNames = selectedDatabase ? [selectedDatabase] : null;
          dtsxSearchData.objectTypes = ['DTSX_PACKAGE'];
        }

        const dtsxResponse = await (advancedMode ? searchAPI.searchAdvanced(dtsxSearchData) : searchAPI.search(dtsxSearchData));
        setDtsxResults(dtsxResponse.data.dtsx_results || []);
      } catch (err) {
        // Ne pas écraser l'erreur de la recherche principale si elle existe
        if (!error) setError(err.response?.data?.error || 'Erreur lors de la recherche DTSX');
      } finally {
        setDtsxLoading(false);
      }
    }
  }, [searchTerm, selectedConnection, selectedDatabase, searchMode, advancedMode, selectedObjectTypes, isDtsxAvailable]);

  // Recherche automatique désactivée - uniquement par clic sur le bouton
  // useEffect(() => {
  //   if (debouncedSearchTerm.trim().length >= 2) {
  //     handleSearch(debouncedSearchTerm);
  //   } else if (debouncedSearchTerm.trim().length === 0) {
  //     setResults([]);
  //     setDtsxResults([]);
  //   }
  // }, [debouncedSearchTerm, handleSearch]);

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

  const handleCopyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      // Feedback visuel temporaire
      const event = new CustomEvent('copySuccess');
      window.dispatchEvent(event);
    } catch (err) {
      console.error('Erreur lors de la copie:', err);
    }
  };

    const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleDtsxRequestSort = (property) => {
    const isAsc = dtsxOrderBy === property && dtsxOrder === 'asc';
    setDtsxOrder(isAsc ? 'desc' : 'asc');
    setDtsxOrderBy(property);
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
      case 'DTSX_PACKAGE': return <DtsxIcon />;
      default: return <StorageIcon />;
    }
  };

  const getObjectTypeLabel = (type) => {
    switch (type) {
      case 'TABLE': return 'Table';
      case 'VIEW': return 'Vue';
            case 'PROCEDURE': return 'Procédure';
      case 'FUNCTION': return 'Fonction';
      case 'DTSX_PACKAGE': return 'Package DTSX';
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

  const getTaskTypeColor = (type) => {
    if (!type) return 'default';
    
    const typeLower = type.toLowerCase();
    
    // Script Tasks
    if (typeLower.includes('scripttask')) return 'info';
    
    // SQL Tasks
    if (typeLower.includes('executesqltask') || typeLower.includes('sqltask')) return 'success';
    
    // File System Tasks
    if (typeLower.includes('filesystemtask')) return 'warning';
    
    // Data Flow Tasks
    if (typeLower.includes('dataflowtask') || typeLower.includes('dataflow')) return 'secondary';
    
    // Sequence Container
    if (typeLower.includes('sequence') || typeLower.includes('container')) return 'primary';
    
    // For Loop / Foreach Loop
    if (typeLower.includes('loop')) return 'error';
    
    // Send Mail Task
    if (typeLower.includes('sendmail') || typeLower.includes('mail')) return 'info';
    
    // FTP Task
    if (typeLower.includes('ftp')) return 'warning';
    
    // Web Service Task
    if (typeLower.includes('webservice') || typeLower.includes('web')) return 'secondary';
    
    // Default
    return 'default';
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

  // Fonction pour formater les valeurs des variables DTSX
  const formatDtsxValue = (value) => {
    if (value === null || value === undefined) {
      return 'N/A';
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

  const handleExportDtsxCSV = (dtsxResults) => {
    const headers = [
      'Serveur',
      'Nom',
      'Description',
      'Jobs SQL',
      'Créateur',
      'Date de création'
    ].join(',');

    const rows = dtsxResults.map(dtsx => [
      dtsx.server,
      dtsx.object_name,
      dtsx.description || '',
      dtsx.job_count || 0,
      dtsx.creator_name || '',
      dtsx.creation_date ? new Date(dtsx.creation_date).toLocaleString('fr-FR') : ''
    ].map(value => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(','));

    const csvContent = `${headers}\n${rows.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dtsx_${searchTerm}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setCsvExportSuccess(true);
    setTimeout(() => setCsvExportSuccess(false), 2000);
  };

  // Fonctions pour les actions DTSX (sans visualisation)
  const handleViewDtsxJobs = (dtsx) => {
    // Pour l'instant, on affiche juste une alerte
    alert(`Jobs utilisant ${dtsx.object_name} sur ${dtsx.server}`);
  };

  const handleViewDtsxDetails = async (dtsx) => {
    try {
      setSelectedDtsx(dtsx);
      setDtsxDetailsDialogOpen(true);
      setDtsxDetailsLoading(true);
      setError(null);

      // Utiliser le chemin complet du fichier si disponible, sinon utiliser l'API par serveur/nom
      let response;
      if (dtsx.file_path) {
        // Appel direct avec le chemin du fichier
        response = await fetch(`/api/search/dtsx-file`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filePath: dtsx.file_path })
        });
      } else {
        // Fallback vers l'API par serveur/nom
        response = await fetch(`/api/search/dtsx/${dtsx.server}/${encodeURIComponent(dtsx.object_name)}`);
      }
      
      if (!response.ok) { 
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }
      
      const dtsxData = await response.json(); 
      console.log('=== DTSX DATA DEBUG ==='); 
      console.log('DTSX Data complète:', dtsxData);
      console.log('DTSX Details:', dtsxData.dtsx);
      console.log('Variables:', dtsxData.dtsx?.variables);
      console.log('Package Parameters:', dtsxData.dtsx?.package_parameters);
      console.log('Connection Managers:', dtsxData.dtsx?.connection_managers);
      console.log('Executables:', dtsxData.dtsx?.executables);
      console.log('=== FIN DEBUG ===');
      setDtsxDetails(dtsxData.dtsx);
    } catch (error) {
      console.error('Erreur lors de la récupération des détails DTSX:', error);
      setError('Erreur lors de la récupération des détails du package DTSX');
    } finally {
      setDtsxDetailsLoading(false);
    }
  };

  const handleOpenDtsxFile = (dtsx) => {
    // Ouvrir le fichier DTSX dans l'explorateur de fichiers
    const filePath = dtsx.file_path;
    if (filePath) {
      // Utiliser l'API Windows pour ouvrir le fichier
      window.open(`file://${filePath}`, '_blank');
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <SearchIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h5" component="h1">
          Recherche
        </Typography>
      </Box>

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
                disabled={dbLoading || dtsxLoading || !searchTerm.trim()}
              >
                {dbLoading || dtsxLoading ? 'Recherche...' : 'Rechercher'}
              </Button>
            </Grid>
          </Grid>

          {/* Indicateur pour rouvrir la section avancée */}
          {!advancedMode && (
            <Box mt={2} display="flex" justifyContent="center">
              <Button
                size="small"
                variant="outlined"
                startIcon={<ExpandMoreIcon />}
                onClick={() => setAdvancedMode(true)}
                sx={{ fontSize: '0.875rem' }}
              >
                Afficher les options avancées
              </Button>
            </Box>
          )}

          {advancedMode && (
            <Box mt={2}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="subtitle2">
                  Options avancées
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setAdvancedMode(false)}
                >
                  <ExpandMoreIcon sx={{ transform: 'rotate(180deg)' }} />
                </IconButton>
              </Box>
              <Grid container spacing={3} alignItems="flex-start">
                <Grid item xs={12} md={8}>
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
                  
                  {/* Raccourcis de filtres */}
                  <Box mt={2}>
                    <Typography variant="subtitle2" gutterBottom>
                      Raccourcis de filtres :
                    </Typography>
                    <Box display="flex" justifyContent="flex-start" gap={0.5} flexWrap="wrap">
                      <Chip
                        label="Packages DTSX"
                        size="small"
                        variant={selectedObjectTypes.length === 1 && selectedObjectTypes.includes('DTSX_PACKAGE') && searchMode === 'complete' ? "filled" : "outlined"}
                        color={selectedObjectTypes.length === 1 && selectedObjectTypes.includes('DTSX_PACKAGE') && searchMode === 'complete' ? "primary" : "default"}
                        onClick={() => {
                          setSelectedObjectTypes(['DTSX_PACKAGE']);
                          setSearchMode('complete');
                        }}
                        sx={{ cursor: 'pointer' }}
                      />
                      <Chip
                        label="Tables uniquement"
                        size="small"
                        variant={selectedObjectTypes.length === 1 && selectedObjectTypes.includes('TABLE') && searchMode === 'fast' ? "filled" : "outlined"}
                        color={selectedObjectTypes.length === 1 && selectedObjectTypes.includes('TABLE') && searchMode === 'fast' ? "primary" : "default"}
                        onClick={() => {
                          setSelectedObjectTypes(['TABLE']);
                          setSearchMode('fast');
                        }}
                        sx={{ cursor: 'pointer' }}
                      />
                      <Chip
                        label="Procédures uniquement"
                        size="small"
                        variant={selectedObjectTypes.length === 1 && selectedObjectTypes.includes('PROCEDURE') && searchMode === 'fast' ? "filled" : "outlined"}
                        color={selectedObjectTypes.length === 1 && selectedObjectTypes.includes('PROCEDURE') && searchMode === 'fast' ? "primary" : "default"}
                        onClick={() => {
                          setSelectedObjectTypes(['PROCEDURE']);
                          setSearchMode('fast');
                        }}
                        sx={{ cursor: 'pointer' }}
                      />
                      <Chip
                        label="Tout sauf DTSX"
                        size="small"
                        variant={selectedObjectTypes.length === 4 && 
                                 selectedObjectTypes.includes('TABLE') && 
                                 selectedObjectTypes.includes('VIEW') && 
                                 selectedObjectTypes.includes('PROCEDURE') && 
                                 selectedObjectTypes.includes('FUNCTION') && 
                                 !selectedObjectTypes.includes('DTSX_PACKAGE') && 
                                 searchMode === 'fast' ? "filled" : "outlined"}
                        color={selectedObjectTypes.length === 4 && 
                               selectedObjectTypes.includes('TABLE') && 
                               selectedObjectTypes.includes('VIEW') && 
                               selectedObjectTypes.includes('PROCEDURE') && 
                               selectedObjectTypes.includes('FUNCTION') && 
                               !selectedObjectTypes.includes('DTSX_PACKAGE') && 
                               searchMode === 'fast' ? "primary" : "default"}
                        onClick={() => {
                          setSelectedObjectTypes(['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION']);
                          setSearchMode('fast');
                        }}
                        sx={{ cursor: 'pointer' }}
                      />
                      <Chip
                        label="Tout réinitialiser"
                        size="small"
                        variant="outlined"
                        color="secondary"
                        onClick={() => {
                          setSelectedObjectTypes(['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION']);
                          setSearchMode('fast');
                        }}
                        sx={{ cursor: 'pointer' }}
                      />
                    </Box>
                  </Box>
                </Grid>
                
                <Grid item xs={12} md={4}>
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
                          label="Rapide"
                        />
                      </Grid>
                      <Grid item>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={searchMode === 'complete'}
                              onChange={() => setSearchMode('complete')}
                              color="primary"
                            />
                          }
                          label="Complet"
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

      {(dbLoading || dtsxLoading) && (
        <Box sx={{ mb: 2 }}>
          {dbLoading && <LinearProgress sx={{ mb: 1 }} />}
          {dtsxLoading && <LinearProgress />}
        </Box>
      )}

      {results.length > 0 && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Résultats ({results.length} objets {dtsxResults.length > 0 ? ` + ${dtsxResults.length} packages SSIS` : ''})
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

      {!dbLoading && results.length === 0 && dtsxResults.length === 0 && searchTerm && (
        <Box textAlign="center" py={4}>
          <Typography variant="h6" color="textSecondary">
            Aucun résultat trouvé
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Essayez de modifier vos critères de recherche
          </Typography>
        </Box>
      )}

      {/* Résultats DTSX */}
      {selectedObjectTypes.includes('DTSX_PACKAGE') && dtsxResults.length > 0 && (
        <Box mt={4}>
          <Accordion defaultExpanded={false}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                <Box display="flex" alignItems="center" gap={2}>
                  <DtsxIcon color="primary" />
                  <Typography variant="h6">
                    Packages SSIS ({dtsxResults.length})
                  </Typography>
                  {dtsxLoading && <CircularProgress size={20} />}
                </Box>
                <Button
                  onClick={() => handleExportDtsxCSV(dtsxResults)}
                  disabled={dtsxResults.length === 0}
                  color={csvExportSuccess ? "success" : "primary"}
                  variant={csvExportSuccess ? "contained" : "outlined"}
                  size="small"
                  startIcon={<CopyIcon />}
                >
                  {csvExportSuccess ? "Exporté !" : "Export CSV"}
                </Button>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <TableSortLabel
                          active={dtsxOrderBy === 'object_name'}
                          direction={dtsxOrderBy === 'object_name' ? dtsxOrder : 'asc'}
                          onClick={() => handleDtsxRequestSort('object_name')}
                        >
                          Nom du Package
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={dtsxOrderBy === 'server'}
                          direction={dtsxOrderBy === 'server' ? dtsxOrder : 'asc'}
                          onClick={() => handleDtsxRequestSort('server')}
                        >
                          Serveur
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={dtsxOrderBy === 'description'}
                          direction={dtsxOrderBy === 'description' ? dtsxOrder : 'asc'}
                          onClick={() => handleDtsxRequestSort('description')}
                        >
                          Description
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={dtsxOrderBy === 'job_count'}
                          direction={dtsxOrderBy === 'job_count' ? dtsxOrder : 'asc'}
                          onClick={() => handleDtsxRequestSort('job_count')}
                        >
                          Jobs SQL
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortResults(dtsxResults, dtsxOrderBy, dtsxOrder).map((dtsx, index) => (
                      <TableRow key={index} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <DtsxIcon color="primary" />
                            <Typography variant="body1" fontWeight="medium">
                              {dtsx.object_name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={dtsx.server}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              {dtsx.description || 'Aucune description'}
                            </Typography>
                            {dtsx.creation_date && (
                              <Typography variant="caption" color="textSecondary">
                                Créé le : {new Date(dtsx.creation_date).toLocaleDateString('fr-FR')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2">
                              {dtsx.job_count || 0} job(s)
                            </Typography>
                            {dtsx.jobs && dtsx.jobs.length > 0 && (
                              <Tooltip title="Voir les jobs">
                                <IconButton
                                  size="small"
                                  color="info"
                                  onClick={() => handleViewDtsxJobs(dtsx)}
                                >
                                  <JobIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Tooltip title="Afficher les détails">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleViewDtsxDetails(dtsx)}
                              >
                                <ViewIcon />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
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

      {/* Dialogue Détails DTSX */}
      <Dialog
        open={dtsxDetailsDialogOpen}
        onClose={() => setDtsxDetailsDialogOpen(false)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">
                📦 {selectedDtsx?.object_name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {selectedDtsx?.server} • Package DTSX
              </Typography>
            </Box>
            <Button 
              onClick={() => setDtsxDetailsDialogOpen(false)}
              startIcon={<InfoIcon />}
              variant="outlined"
              size="small"
            >
              Fermer
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {dtsxDetailsLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" py={4}>
              <CircularProgress sx={{ mb: 2 }} />
              <Typography variant="body2" color="textSecondary" align="center">
                Analyse du package DTSX en cours...<br/>
                Extraction des informations détaillées...
              </Typography>
            </Box>
          ) : dtsxDetails ? (
            <Box>


              {/* Paramètres */}
              {dtsxDetails.package_parameters && dtsxDetails.package_parameters.length > 0 && (
                <Accordion defaultExpanded={false}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <SettingsIcon color="primary" />
                      <Typography variant="h6">
                        Paramètres ({dtsxDetails.package_parameters.length})
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Nom</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Valeur</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {dtsxDetails.package_parameters.map((param, index) => (
                            <TableRow key={index} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight="medium">
                                  {param.name}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Box display="flex" alignItems="center" gap={1}>
                                  <Typography variant="body2" sx={{ 
                                    maxWidth: 350, 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flex: 1
                                  }} title={formatDtsxValue(param.value)}>
                                    {formatDtsxValue(param.value)}
                                  </Typography>
                                  <Tooltip title="Copier la valeur">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCopyText(formatDtsxValue(param.value))}
                                      sx={{ p: 0.5 }}
                                    >
                                      <CopyIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Connexions */}
              {dtsxDetails.connection_managers && dtsxDetails.connection_managers.length > 0 && (
                <Accordion defaultExpanded={false}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <LinkIcon color="primary" />
                      <Typography variant="h6">
                        Connexions ({dtsxDetails.connection_managers.length})
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Nom</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {dtsxDetails.connection_managers.map((conn, index) => (
                            <TableRow key={index} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight="medium">
                                  {conn.name}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip 
                                  label={conn.type} 
                                  size="small" 
                                  color="secondary" 
                                  variant="outlined"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              )}



              {/* Variables */}
              {dtsxDetails.variables && dtsxDetails.variables.length > 0 && (
                <Accordion defaultExpanded={false}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <SettingsIcon color="primary" />
                      <Typography variant="h6">
                        Variables ({dtsxDetails.variables.length})
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Nom</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Valeur</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Expression</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {dtsxDetails.variables.map((var_, index) => (
                            <TableRow key={index} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight="medium">
                                  {var_.name}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Box display="flex" alignItems="center" gap={1}>
                                  <Typography variant="body2" sx={{ 
                                    maxWidth: 200, 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flex: 1
                                  }} title={formatDtsxValue(var_.value)}>
                                    {formatDtsxValue(var_.value)}
                                  </Typography>
                                  <Tooltip title="Copier la valeur">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCopyText(formatDtsxValue(var_.value))}
                                      sx={{ p: 0.5 }}
                                    >
                                      <CopyIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                              <TableCell>
                                {var_.expression && (
                                  <Box display="flex" alignItems="center" gap={1}>
                                    <Typography variant="body2" sx={{ 
                                      maxWidth: 250, 
                                      overflow: 'hidden', 
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      fontStyle: 'italic',
                                      color: 'text.secondary',
                                      flex: 1
                                    }} title={var_.expression}>
                                      {var_.expression}
                                    </Typography>
                                    <Tooltip title="Copier l'expression">
                                      <IconButton
                                        size="small"
                                        onClick={() => handleCopyText(var_.expression)}
                                        sx={{ p: 0.5 }}
                                      >
                                        <CopyIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Etapes */}
              {dtsxDetails.executables && dtsxDetails.executables.length > 0 && (
                <Accordion defaultExpanded={false}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <PlayArrowIcon color="primary" />
                      <Typography variant="h6">
                        Etapes ({dtsxDetails.executables.length})
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {dtsxDetails.executables
                      .map((task, index) => {
                      const taskColor = getTaskTypeColor(task.type);
                      return (
                        <Accordion key={index} sx={{ 
                          mb: 1,
                          opacity: task.disabled ? 0.6 : 1,
                          '& .MuiAccordionSummary-root': {
                            borderLeft: `4px solid`,
                            borderLeftColor: task.disabled ? 'grey.400' : `${taskColor}.main`,
                            backgroundColor: task.disabled ? 'grey.100' : `${taskColor}.50`
                          }
                        }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Box display="flex" alignItems="center" gap={1} width="100%">
                            <Box display="flex" alignItems="center" gap={1} flex={1}>
                              <Typography variant="subtitle1" fontWeight="medium">
                                {task.name}
                              </Typography>
                              {task.disabled && (
                                <Chip 
                                  label="Désactivée" 
                                  size="small" 
                                  color="default" 
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              )}
                            </Box>
                            {task.description && (
                              <Typography variant="body2" color="textSecondary" sx={{ flex: 1 }}>
                                {task.description}
                              </Typography>
                            )}
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Grid container spacing={2}>                         
                            {/* Détails spécifiques selon le type de tâche */}
                            {task.Operation && (
                              <Grid item xs={12} md={4}>
                                <Typography variant="subtitle2" color="primary" gutterBottom>
                                  Opération
                                </Typography>
                                <Chip label={task.Operation} size="small" color="secondary" />
                              </Grid>
                            )}
                            
                            {task.Source && (
                              <Grid item xs={12} md={4}>
                                <Typography variant="subtitle2" color="primary" gutterBottom>
                                  Source
                                </Typography>
                                <Typography variant="body2" sx={{ 
                                  wordBreak: 'break-all',
                                  backgroundColor: 'grey.50',
                                  p: 1,
                                  borderRadius: 1
                                }}>
                                  {task.Source}
                                </Typography>
                              </Grid>
                            )}
                            
                            {task.Destination && (
                              <Grid item xs={12} md={4}>
                                <Typography variant="subtitle2" color="primary" gutterBottom>
                                  Destination
                                </Typography>
                                <Typography variant="body2" sx={{ 
                                  wordBreak: 'break-all',
                                  backgroundColor: 'grey.50',
                                  p: 1,
                                  borderRadius: 1
                                }}>
                                  {task.Destination}
                                </Typography>
                              </Grid>
                            )}
                            
                            {task.SqlStatementSource && (
                              <Grid item xs={12}>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                  <Typography variant="subtitle2" color="primary">
                                    Requête SQL
                                  </Typography>
                                  <Tooltip title="Copier la requête SQL">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCopyText(task.SqlStatementSource)}
                                      sx={{ p: 0.5 }}
                                    >
                                      <CopyIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                                <Box sx={{ 
                                  backgroundColor: '#f8f9fa',
                                  p: 1.5,
                                  maxHeight: 200,
                                  overflow: 'auto'
                                }}>
                                  <SyntaxHighlighter
                                    language="sql"
                                    style={vs}
                                    customStyle={{
                                      backgroundColor: 'transparent',
                                      padding: 0,
                                      margin: 0,
                                      fontSize: '0.875rem',
                                      color: '#000000'
                                    }}
                                  >
                                    {task.SqlStatementSource}
                                  </SyntaxHighlighter>
                                </Box>
                              </Grid>
                            )}
                            
                            {task.Connection && (
                              <Grid item xs={12} md={6}>
                                <Typography variant="subtitle2" color="primary" gutterBottom>
                                  Connexion
                                </Typography>
                                <Typography variant="body2" gutterBottom>
                                  {task.Connection}
                                </Typography>
                              </Grid>
                            )}
                            
                            {task.Language && (
                              <Grid item xs={12} md={6}>
                                <Typography variant="subtitle2" color="primary" gutterBottom>
                                  Langage
                                </Typography>
                                <Chip label={task.Language} size="small" color="info" />
                              </Grid>
                            )}
                            
                            {task.ScriptCode && (  
                              <Grid item xs={12}>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                  <Typography variant="subtitle2" color="primary">
                                    Code Source
                                  </Typography>
                                  <Tooltip title="Copier le code source">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCopyText(task.ScriptCode)}
                                      sx={{ p: 0.5 }}
                                    > 
                                      <CopyIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                                <Box sx={{ 
                                  backgroundColor: '#f8f9fa',
                                  p: 1.5,
                                  maxHeight: 300,
                                  overflow: 'auto'
                                }}>
                                  <SyntaxHighlighter
                                    language={task.Language === 'C#' ? 'csharp' : 'vbnet'}
                                    style={vs}
                                    customStyle={{
                                      backgroundColor: 'transparent',
                                      padding: 0,
                                      margin: 0,
                                      fontSize: '0.875rem',
                                      color: '#000000'
                                    }}
                                  >
                                    {task.ScriptCode}
                                  </SyntaxHighlighter>
                                </Box>
                              </Grid>
                            )}
                            
                            {task.Components && task.Components.length > 0 && (
                              <Grid item xs={12}>
                                <Typography variant="subtitle2" color="primary" gutterBottom>
                                  Composants Data Flow ({task.Components.length})
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                  {task.Components.map((comp, compIndex) => (
                                    <Chip 
                                      key={compIndex}
                                      label={`${comp.Name} (${comp.Type})`}
                                      size="small"
                                      color="secondary"
                                      variant="outlined"
                                    />
                                  ))}
                                </Box>
                              </Grid>
                            )}
                          </Grid>
                        </AccordionDetails>
                      </Accordion>
                    );
                    })}
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Contraintes de Précédence */}
              {dtsxDetails.PrecedenceConstraints && dtsxDetails.PrecedenceConstraints.length > 0 && (
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <LinkIcon color="primary" />
                      <Typography variant="h6">
                        Contraintes de Précédence ({dtsxDetails.PrecedenceConstraints.length})
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Nom</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>De</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Vers</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Expression</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {dtsxDetails.PrecedenceConstraints.map((constraint, index) => (
                            <TableRow key={index} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight="medium">
                                  {constraint.Name}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" color="textSecondary">
                                  {constraint.FromExecutable}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" color="textSecondary">
                                  {constraint.ToExecutable}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ 
                                  maxWidth: 300, 
                                  overflow: 'hidden', 
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }} title={constraint.Expression}>
                                  {constraint.Expression || 'N/A'}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              )}
            </Box>
          ) : (
            <Box textAlign="center" py={4}>
              <DtsxIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="textSecondary" gutterBottom>
                Aucune donnée trouvée
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Impossible de récupérer les détails du package DTSX
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDtsxDetailsDialogOpen(false)}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default Search; 