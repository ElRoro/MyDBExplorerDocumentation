import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TablePagination,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
  TableSortLabel
} from '@mui/material';
import {
  Storage as StorageIcon,
  TableChart as TableIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Clear as ClearIcon,
  Code as DdlIcon,
  ContentCopy as CopyIcon,
  AccountTree as DependenciesIcon,
  TableRows as DataIcon,
  Comment as CommentIcon,
  TrendingUp as TrendingUpIcon,
  Lock as LockIcon,
  Backup as BackupIcon
} from '@mui/icons-material';
import { connectionsAPI, commentsAPI, searchAPI } from '../services/api';
import axios from 'axios';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

const Maintenance = () => {
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [emptyTables, setEmptyTables] = useState([]);
  const [heapTables, setHeapTables] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
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
  const [csvExportSuccess, setCsvExportSuccess] = useState(false);
  const [sqlCopySuccess, setSqlCopySuccess] = useState(false);
  const [dataPage, setDataPage] = useState(0);
  const [dataRowsPerPage, setDataRowsPerPage] = useState(10);
  
  // États pour l'analyse avancée
  const [analysisData, setAnalysisData] = useState({
    indexAnalysis: null,
    locksAnalysis: null,
    backupAnalysis: null
  });
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  // Ajouter les états pour le tri
  const [emptyOrderBy, setEmptyOrderBy] = useState('table_name');
  const [emptyOrder, setEmptyOrder] = useState('asc');

  // États pour le tri du tableau Heap Tables
  const [heapOrderBy, setHeapOrderBy] = useState('table_name');
  const [heapOrder, setHeapOrder] = useState('asc');

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
    try {
      const response = await connectionsAPI.getDatabases(connectionId);
      setDatabases(response.data || []);
    } catch (err) {
      setDatabases([]);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      // Analyse de maintenance classique
      const maintenanceParams = {};
      if (selectedConnection) {
        maintenanceParams.connectionId = selectedConnection;
      }
      if (selectedDatabase) {
        maintenanceParams.databaseName = selectedDatabase;
      }

      const maintenanceResponse = await axios.get('/api/maintenance/analyze', { params: maintenanceParams });

      if (maintenanceResponse.data.success) {
        const emptyTables = maintenanceResponse.data.data.emptyTables || [];
        const heapTables = maintenanceResponse.data.data.heapTables || [];
        
        setEmptyTables(emptyTables);
        setHeapTables(heapTables);
        
        // Charger les commentaires existants pour tous les objets
        const allObjects = [...emptyTables, ...heapTables];
        await loadExistingComments(allObjects);
      } else {
        setError('Erreur lors de l\'analyse de maintenance');
      }

      // Analyses avancées (seulement si une connexion et une base de données sont sélectionnées)
      if (selectedConnection && selectedDatabase) {
        const analysisParams = {
          connectionId: selectedConnection,
          databaseName: selectedDatabase
        };

        // Lancer toutes les analyses en parallèle
        const analysisPromises = [
          axios.get('/api/analysis/index-analysis', { params: analysisParams }),
          axios.get('/api/analysis/locks-analysis', { params: analysisParams }),
          axios.get('/api/analysis/backup-analysis', { params: analysisParams })
        ];

        try {
          const [indexResponse, locksResponse, backupResponse] = await Promise.all(analysisPromises);
          
          setAnalysisData({
            indexAnalysis: indexResponse.data,
            locksAnalysis: locksResponse.data,
            backupAnalysis: backupResponse.data
          });
        } catch (analysisError) {
          console.error('Erreur lors des analyses avancées:', analysisError);
          setAnalysisError('Erreur lors des analyses avancées. Vérifiez que la base de données supporte ces analyses.');
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'analyse de maintenance');
    } finally {
      setLoading(false);
      setAnalysisLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setPage(0);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
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
    switch (type?.toUpperCase()) {
      case 'SQLSERVER':
        return 'primary';
      case 'MYSQL':
        return 'success';
      case 'MARIADB':
        return 'info';
      default:
        return 'default';
    }
  };

  const formatSize = (sizeMb) => {
    if (sizeMb >= 1024) {
      return `${(sizeMb / 1024).toFixed(2)} GB`;
    }
    return `${sizeMb.toFixed(2)} MB`;
  };

  const formatRowCount = (count) => {
    return count.toLocaleString();
  };

  // Fonctions pour les actions
  const handleViewDDL = async (obj) => {
    try {
      setSelectedObject(obj);
      setDdlDialogOpen(true);
      setDdlLoading(true);
      setDdlContent('');

      // Adapter pour les objets de maintenance (tables) vs objets de recherche
      const objectName = obj.object_name || obj.table_name;
      const objectType = obj.object_type || 'TABLE';

      const response = await axios.get(`/api/search/ddl/${obj.connection_id}/${obj.database_name}/${objectType}/${objectName}`, {
        params: {
          schema_name: obj.schema_name
        }
      });

      setDdlContent(response.data.ddl || 'DDL non disponible');
    } catch (error) {
      setDdlContent('Erreur lors de la récupération du DDL: ' + (error.response?.data?.error || error.message));
    } finally {
      setDdlLoading(false);
    }
  };

  const handleViewDependencies = async (obj) => {
    try {
      setSelectedObjectForDependencies(obj);
      setDependenciesDialogOpen(true);
      setDependenciesLoading(true);
      setDependencies([]);

      // Adapter pour les objets de maintenance (tables) vs objets de recherche
      const objectName = obj.object_name || obj.table_name;
      const objectType = obj.object_type || 'TABLE';

      const response = await searchAPI.getDependencies(
        obj.connection_id,
        obj.database_name,
        objectType,
        objectName,
        obj.schema_name || ''
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
        dependency.parent_schema || ''
      );

      setDependencyDdlContent(response.data.ddl || 'DDL non disponible');
    } catch (error) {
      setDependencyDdlContent('Erreur lors de la récupération du DDL: ' + (error.response?.data?.error || error.message));
    } finally {
      setDependencyDdlLoading(false);
    }
  };

  const handleViewTableData = async (obj) => {
    // Vérifier si c'est une table (pour les objets orphelins) ou si c'est une table de maintenance
    const isTable = obj.object_type === 'TABLE' || obj.object_type === undefined;
    if (!isTable) return;
    
    try {
      setSelectedTable(obj);
      setDataDialogOpen(true);
      setDataLoading(true);
      setTableData({ columns: [], data: [] });

      // Adapter pour les objets de maintenance (tables) vs objets de recherche
      const objectName = obj.object_name || obj.table_name;

      const response = await axios.get(`/api/search/data/${obj.connection_id}/${obj.database_name}/${objectName}`, {
        params: {
          schema_name: obj.schema_name,
          limit: dataRowsPerPage
        }
      });

      setTableData({
        columns: response.data.columns || [],
        data: response.data.data || []
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des données:', error);
      setTableData({ columns: [], data: [] });
    } finally {
      setDataLoading(false);
    }
  };

  const handleAddComment = async (obj) => {
    try {
      setSelectedObjectForComment(obj);
      setCommentDialogOpen(true);
      setCommentText('');
      setExistingComment(null);

      // Adapter pour les objets de maintenance (tables) vs objets de recherche
      const objectName = obj.object_name || obj.table_name;
      const objectType = obj.object_type || 'TABLE';

      // Charger le commentaire existant
      const response = await commentsAPI.getComment(
        obj.connection_id,
        obj.database_name,
        objectType,
        objectName,
        obj.schema_name
      );

      if (response.data.comment) {
        setExistingComment(response.data.comment);
        setCommentText(response.data.comment.comment);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du commentaire:', error);
    }
  };

  const handleSaveComment = async () => {
    if (!selectedObjectForComment || !commentText.trim()) return;

    setCommentLoading(true);
    try {
      // Adapter pour les objets de maintenance (tables) vs objets de recherche
      const objectName = selectedObjectForComment.object_name || selectedObjectForComment.table_name;
      const objectType = selectedObjectForComment.object_type || 'TABLE';

      const commentData = {
        connectionId: selectedObjectForComment.connection_id,
        databaseName: selectedObjectForComment.database_name,
        objectType: objectType,
        objectName: objectName,
        schemaName: selectedObjectForComment.schema_name,
        comment: commentText.trim()
      };

      if (existingComment) {
        await commentsAPI.updateComment(existingComment.id, commentData);
      } else {
        await commentsAPI.addComment(commentData);
      }

      setCommentDialogOpen(false);
      setCommentText('');
      setExistingComment(null);
      setSelectedObjectForComment(null);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du commentaire:', error);
    } finally {
      setCommentLoading(false);
    }
  };

  const hasComment = (obj) => {
    // Adapter pour les objets de maintenance (tables) vs objets de recherche
    const objectName = obj.object_name || obj.table_name;
    const objectType = obj.object_type || 'TABLE';
    return existingComments.has(`${obj.connection_id}-${obj.database_name}-${objectType}-${objectName}-${obj.schema_name || ''}`);
  };

  const loadExistingComments = async (objects) => {
    const commentsMap = new Map();
    
    for (const obj of objects) {
      try {
        // Adapter pour les objets de maintenance (tables) vs objets de recherche
        const objectName = obj.object_name || obj.table_name;
        const objectType = obj.object_type || 'TABLE';

        const response = await commentsAPI.getComment(
          obj.connection_id,
          obj.database_name,
          objectType,
          objectName,
          obj.schema_name
        );
        
        if (response.data.comment) {
          const key = `${obj.connection_id}-${obj.database_name}-${objectType}-${objectName}-${obj.schema_name || ''}`;
          commentsMap.set(key, response.data.comment);
        }
      } catch (error) {
        // Ignore les erreurs pour les commentaires
      }
    }
    
    setExistingComments(commentsMap);
  };

  const handleCopyDDL = async () => {
    try {
      await navigator.clipboard.writeText(ddlContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
    }
  };

  // Fonctions d'export
  const generateCSV = (columns, data) => {
    const headers = columns.map(col => col.name).join(',');
    const rows = data.map(row => 
      columns.map(col => {
        const value = row[col.key];
        if (value === null || value === undefined) return '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    );
    return [headers, ...rows].join('\n');
  };

  const generateSQLQuery = (table, limit = 200) => {
    const tableName = table?.object_name || table?.table_name;
    const schemaName = table?.schema_name;
    const databaseName = table?.database_name;
    
    let query = `SELECT `;
    
    if (tableData.columns.length > 0) {
      query += tableData.columns.map(col => col.name).join(', ');
    } else {
      query += '*';
    }
    
    query += `\nFROM `;
    
    if (schemaName && schemaName !== 'dbo') {
      query += `[${schemaName}].[${tableName}]`;
    } else {
      query += `[${tableName}]`;
    }
    
    if (limit) {
      query += `\nLIMIT ${limit}`;
    }
    
    return query;
  };

  // Fonction de tri générique
  const handleEmptySort = (property) => {
    const isAsc = emptyOrderBy === property && emptyOrder === 'asc';
    setEmptyOrder(isAsc ? 'desc' : 'asc');
    setEmptyOrderBy(property);
  };

  const sortedEmptyTables = [...emptyTables].sort((a, b) => {
    let aValue = a[emptyOrderBy] || '';
    let bValue = b[emptyOrderBy] || '';
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return emptyOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }
    return emptyOrder === 'asc'
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });

  const handleHeapSort = (property) => {
    const isAsc = heapOrderBy === property && heapOrder === 'asc';
    setHeapOrder(isAsc ? 'desc' : 'asc');
    setHeapOrderBy(property);
  };

  const sortedHeapTables = [...heapTables].sort((a, b) => {
    let aValue = a[heapOrderBy] || '';
    let bValue = b[heapOrderBy] || '';
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return heapOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }
    return heapOrder === 'asc'
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });


  const renderIndexAnalysis = () => {
    const data = analysisData.indexAnalysis;
    if (!data) return <Typography>Aucune donnée disponible</Typography>;

    // Vérifier s'il y a un message d'information
    if (data.data?.message) {
      return (
        <Alert severity="info">
          {data.data.message}
        </Alert>
      );
    }

    return (
      <Grid container spacing={3}>
        {/* Index manquants SQL Server */}
        {data.data?.missingIndexes && data.data.missingIndexes.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <WarningIcon color="warning" sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Index Manquants (SQL Server)
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Table</TableCell>
                        <TableCell>Colonnes d'égalité</TableCell>
                        <TableCell>Colonnes d'inégalité</TableCell>
                        <TableCell>Colonnes incluses</TableCell>
                        <TableCell>Usage total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.data.missingIndexes.map((index, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{index.table_name}</TableCell>
                          <TableCell>{index.equality_columns || '-'}</TableCell>
                          <TableCell>{index.inequality_columns || '-'}</TableCell>
                          <TableCell>{index.included_columns || '-'}</TableCell>
                          <TableCell>{index.total_usage || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Index inutilisés SQL Server */}
        {data.data?.unusedIndexes && data.data.unusedIndexes.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <TrendingUpIcon color="info" sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Index Inutilisés (SQL Server)
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Table</TableCell>
                        <TableCell>Index</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Dernière utilisation</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.data.unusedIndexes.map((index, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{index.table_name}</TableCell>
                          <TableCell>{index.index_name}</TableCell>
                          <TableCell>{index.index_type}</TableCell>
                          <TableCell>
                            {index.last_user_seek || index.last_user_scan || 'Jamais utilisé'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Usage des index MySQL */}
        {data.data?.indexUsage && data.data.indexUsage.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <TrendingUpIcon color="info" sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Usage des Index (MySQL/MariaDB)
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Table</TableCell>
                        <TableCell>Index</TableCell>
                        <TableCell>Cardinalité</TableCell>
                        <TableCell>Type</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.data.indexUsage.map((index, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{index.TABLE_NAME}</TableCell>
                          <TableCell>{index.INDEX_NAME}</TableCell>
                          <TableCell>{index.CARDINALITY}</TableCell>
                          <TableCell>{index.INDEX_TYPE}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {(!data.data?.missingIndexes?.length && !data.data?.unusedIndexes?.length && !data.data?.indexUsage?.length) && (
          <Grid item xs={12}>
            <Alert severity="info">
              Aucun index manquant ou inutilisé détecté pour cette base de données.
            </Alert>
          </Grid>
        )}
      </Grid>
    );
  };

  const renderLocksAnalysis = () => {
    const data = analysisData.locksAnalysis;
    if (!data) return <Typography>Aucune donnée disponible</Typography>;

    // Vérifier s'il y a un message d'information
    if (data.data?.message) {
      return (
        <Alert severity="info">
          {data.data.message}
        </Alert>
      );
    }

    return (
      <Grid container spacing={3}>
        {/* Blocages SQL Server */}
        {data.data?.blocking && data.data.blocking.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <LockIcon color="error" sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Sessions Bloquées (SQL Server)
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Session ID</TableCell>
                        <TableCell>Session Bloquante</TableCell>
                        <TableCell>Commande</TableCell>
                        <TableCell>Temps d'attente</TableCell>
                        <TableCell>Utilisateur</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.data.blocking.map((block, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{block.session_id}</TableCell>
                          <TableCell>{block.blocking_session_id}</TableCell>
                          <TableCell>{block.command}</TableCell>
                          <TableCell>{block.wait_time}ms</TableCell>
                          <TableCell>{block.login_name}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Processlist MySQL */}
        {data.data?.processList && data.data.processList.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <LockIcon color="info" sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Processus Actifs (MySQL/MariaDB)
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Utilisateur</TableCell>
                        <TableCell>Hôte</TableCell>
                        <TableCell>Base</TableCell>
                        <TableCell>Commande</TableCell>
                        <TableCell>Temps</TableCell>
                        <TableCell>État</TableCell>
                        <TableCell>Info</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.data.processList.map((process, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{process.Id}</TableCell>
                          <TableCell>{process.User}</TableCell>
                          <TableCell>{process.Host}</TableCell>
                          <TableCell>{process.db}</TableCell>
                          <TableCell>{process.Command}</TableCell>
                          <TableCell>{process.Time}</TableCell>
                          <TableCell>{process.State}</TableCell>
                          <TableCell>{process.Info}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {(!data.data?.blocking?.length && !data.data?.processList?.length) && (
          <Grid item xs={12}>
            <Alert severity="info">
              Aucun verrou ou blocage détecté pour cette base de données.
            </Alert>
          </Grid>
        )}
      </Grid>
    );
  };

  const renderBackupAnalysis = () => {
    const data = analysisData.backupAnalysis;
    if (!data) return <Typography>Aucune donnée disponible</Typography>;

    // Vérifier s'il y a un message d'information
    if (data.data?.message) {
      return (
        <Alert severity="info">
          {data.data.message}
        </Alert>
      );
    }

    return (
      <Grid container spacing={3}>
        {/* Sauvegardes SQL Server */}
        {data.data?.backups && data.data.backups.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <BackupIcon color="primary" sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Historique des Sauvegardes (SQL Server)
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Base de données</TableCell>
                        <TableCell>Dernière sauvegarde</TableCell>
                        <TableCell>Dernière sauvegarde complète</TableCell>
                        <TableCell>Dernière sauvegarde différentielle</TableCell>
                        <TableCell>Dernière sauvegarde log</TableCell>
                        <TableCell>Total sauvegardes</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.data.backups.map((backup, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{backup.database_name}</TableCell>
                          <TableCell>{backup.last_backup_date}</TableCell>
                          <TableCell>{backup.last_full_backup || 'Aucune'}</TableCell>
                          <TableCell>{backup.last_diff_backup || 'Aucune'}</TableCell>
                          <TableCell>{backup.last_log_backup || 'Aucune'}</TableCell>
                          <TableCell>{backup.total_backups}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Logs binaires MySQL */}
        {data.data?.binaryLogs && data.data.binaryLogs.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <BackupIcon color="primary" sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Logs Binaires (MySQL/MariaDB)
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Nom du fichier</TableCell>
                        <TableCell>Taille</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.data.binaryLogs.map((log, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{log.Log_name}</TableCell>
                          <TableCell>{log.File_size}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {(!data.data?.backups?.length && !data.data?.binaryLogs?.length) && (
          <Grid item xs={12}>
            <Alert severity="info">
              Aucune information de sauvegarde disponible pour cette base de données.
            </Alert>
          </Grid>
        )}
      </Grid>
    );
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Maintenance
      </Typography>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Connexion (optionnel)</InputLabel>
                <Select
                  value={selectedConnection}
                  onChange={(e) => setSelectedConnection(e.target.value)}
                  label="Connexion (optionnel)"
                >
                  <MenuItem value="">
                    <em>Toutes les connexions</em>
                  </MenuItem>
                  {connections.map((conn) => (
                    <MenuItem key={conn.id} value={conn.id}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip 
                          label={conn.type} 
                          size="small" 
                          color={getConnectionTypeColor(conn.type)}
                        />
                        {conn.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Base de données (optionnel)</InputLabel>
                <Select
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                  label="Base de données (optionnel)"
                  disabled={!selectedConnection}
                >
                  <MenuItem value="">
                    <em>Toutes les bases de données</em>
                  </MenuItem>
                  {databases.map((db) => (
                    <MenuItem key={db} value={db}>
                      {db}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <Button
                variant="contained"
                onClick={handleAnalyze}
                disabled={loading}
                startIcon={<RefreshIcon />}
                fullWidth
              >
                Analyser
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="body2" sx={{ mt: 1 }}>
            Analyse en cours...
          </Typography>
        </Box>
      )}

      {!loading && (emptyTables.length > 0 || heapTables.length > 0) && (
        <Box>
          <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 2 }}>
            <Tab 
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <WarningIcon />
                  Tables Vides ({emptyTables.length})
                </Box>
              } 
            />
            <Tab 
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <InfoIcon />
                  Heap Tables ({heapTables.length})
                </Box>
              } 
            />
          </Tabs>

          {activeTab === 0 && (
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6">
                    Tables vides trouvées : {emptyTables.length}
                  </Typography>
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      onClick={() => {
                        const csvContent = generateCSV(
                          [
                            { name: 'Nom', key: 'table_name' },
                            { name: 'Serveur', key: 'connection_name' },
                            { name: 'Base de données', key: 'database_name' },
                            { name: 'Schéma', key: 'schema_name' }
                          ],
                          emptyTables
                        );
                        const blob = new Blob([csvContent], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'tables_vides_maintenance.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                        setCsvExportSuccess(true);
                        setTimeout(() => setCsvExportSuccess(false), 2000);
                      }}
                      disabled={emptyTables.length === 0}
                      color={csvExportSuccess ? "success" : "primary"}
                      variant={csvExportSuccess ? "contained" : "outlined"}
                      startIcon={<CopyIcon />}
                    >
                      {csvExportSuccess ? "Exporté !" : "Export CSV"}
                    </Button>
                  </Box>
                </Box>
                <TableContainer component={Paper}>
                   <Table>
                     <TableHead>
                       <TableRow>
                         <TableCell>
                           <TableSortLabel
                             active={emptyOrderBy === 'table_name'}
                             direction={emptyOrderBy === 'table_name' ? emptyOrder : 'asc'}
                             onClick={() => handleEmptySort('table_name')}
                           >
                             Nom
                           </TableSortLabel>
                         </TableCell>
                         <TableCell>
                           <TableSortLabel
                             active={emptyOrderBy === 'connection_name'}
                             direction={emptyOrderBy === 'connection_name' ? emptyOrder : 'asc'}
                             onClick={() => handleEmptySort('connection_name')}
                           >
                             Serveur
                           </TableSortLabel>
                         </TableCell>
                         <TableCell>
                           <TableSortLabel
                             active={emptyOrderBy === 'database_name'}
                             direction={emptyOrderBy === 'database_name' ? emptyOrder : 'asc'}
                             onClick={() => handleEmptySort('database_name')}
                           >
                             Base de données
                           </TableSortLabel>
                         </TableCell>
                         <TableCell>
                           <TableSortLabel
                             active={emptyOrderBy === 'schema_name'}
                             direction={emptyOrderBy === 'schema_name' ? emptyOrder : 'asc'}
                             onClick={() => handleEmptySort('schema_name')}
                           >
                             Schéma
                           </TableSortLabel>
                         </TableCell>
                         <TableCell align="center">Actions</TableCell>
                       </TableRow>
                     </TableHead>
                     <TableBody>
                       {sortedEmptyTables
                         .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                         .map((table, index) => (
                           <TableRow key={index}>
                             <TableCell>
                               <Box display="flex" alignItems="center" gap={1}>
                                 <TableIcon color="warning" />
                                 {table.table_name}
                               </Box>
                             </TableCell>
                             <TableCell>
                               <Chip 
                                 label={table.connection_name} 
                                 size="small" 
                                 color={getConnectionTypeColor(table.connection_type)}
                               />
                             </TableCell>
                             <TableCell>{table.database_name}</TableCell>
                             <TableCell>{table.schema_name}</TableCell>
                             <TableCell align="center">
                               <Box display="flex" gap={1} justifyContent="center">
                                 <Tooltip title="Voir le code DDL">
                                   <IconButton
                                     size="small"
                                     color="secondary"
                                     onClick={() => handleViewDDL(table)}
                                   >
                                     <DdlIcon />
                                   </IconButton>
                                 </Tooltip>
                                 <Tooltip title="Voir les dépendances">
                                   <IconButton
                                     size="small"
                                     color="info"
                                     onClick={() => handleViewDependencies(table)}
                                   >
                                     <DependenciesIcon />
                                   </IconButton>
                                 </Tooltip>
                                 <Tooltip title={hasComment(table) ? "Modifier le commentaire" : "Ajouter un commentaire"}>
                                   <IconButton
                                     size="small"
                                     color={hasComment(table) ? "success" : "primary"}
                                     onClick={() => handleAddComment(table)}
                                     sx={{
                                       position: 'relative',
                                       '&::after': hasComment(table) ? {
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

                                 <TablePagination
                   component="div"
                   count={emptyTables.length}
                   page={page}
                   onPageChange={handleChangePage}
                   rowsPerPage={rowsPerPage}
                   onRowsPerPageChange={handleChangeRowsPerPage}
                   labelRowsPerPage="Lignes par page"
                 />
              </CardContent>
            </Card>
          )}

          {activeTab === 1 && (
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6">
                    Heap Tables trouvées : {heapTables.length}
                  </Typography>
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      onClick={() => {
                        const csvContent = generateCSV(
                          [
                            { name: 'Nom', key: 'table_name' },
                            { name: 'Serveur', key: 'connection_name' },
                            { name: 'Base de données', key: 'database_name' },
                            { name: 'Schéma', key: 'schema_name' },
                            { name: 'Lignes', key: 'row_count' },
                            { name: 'Taille (MB)', key: 'size_mb' },
                            { name: 'Index Cluster', key: 'has_clustered_index' }
                          ],
                          heapTables
                        );
                        const blob = new Blob([csvContent], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'heap_tables_maintenance.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                        setCsvExportSuccess(true);
                        setTimeout(() => setCsvExportSuccess(false), 2000);
                      }}
                      disabled={heapTables.length === 0}
                      color={csvExportSuccess ? "success" : "primary"}
                      variant={csvExportSuccess ? "contained" : "outlined"}
                      startIcon={<CopyIcon />}
                    >
                      {csvExportSuccess ? "Exporté !" : "Export CSV"}
                    </Button>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Ces tables n'ont pas d'index cluster et peuvent bénéficier d'une optimisation.
                </Typography>
                <TableContainer component={Paper}>
                   <Table>
                     <TableHead>
                       <TableRow>
                         <TableCell>
                           <TableSortLabel
                             active={heapOrderBy === 'table_name'}
                             direction={heapOrderBy === 'table_name' ? heapOrder : 'asc'}
                             onClick={() => handleHeapSort('table_name')}
                           >
                             Table
                           </TableSortLabel>
                         </TableCell>
                         <TableCell>
                           <TableSortLabel
                             active={heapOrderBy === 'connection_name'}
                             direction={heapOrderBy === 'connection_name' ? heapOrder : 'asc'}
                             onClick={() => handleHeapSort('connection_name')}
                           >
                             Serveur
                           </TableSortLabel>
                         </TableCell>
                         <TableCell>
                           <TableSortLabel
                             active={heapOrderBy === 'database_name'}
                             direction={heapOrderBy === 'database_name' ? heapOrder : 'asc'}
                             onClick={() => handleHeapSort('database_name')}
                           >
                             Base de données
                           </TableSortLabel>
                         </TableCell>
                         <TableCell>
                           <TableSortLabel
                             active={heapOrderBy === 'schema_name'}
                             direction={heapOrderBy === 'schema_name' ? heapOrder : 'asc'}
                             onClick={() => handleHeapSort('schema_name')}
                           >
                             Schéma
                           </TableSortLabel>
                         </TableCell>
                         <TableCell align="right">
                           <TableSortLabel
                             active={heapOrderBy === 'row_count'}
                             direction={heapOrderBy === 'row_count' ? heapOrder : 'asc'}
                             onClick={() => handleHeapSort('row_count')}
                           >
                             Lignes
                           </TableSortLabel>
                         </TableCell>
                         <TableCell align="right">
                           <TableSortLabel
                             active={heapOrderBy === 'size_mb'}
                             direction={heapOrderBy === 'size_mb' ? heapOrder : 'asc'}
                             onClick={() => handleHeapSort('size_mb')}
                           >
                             Taille
                           </TableSortLabel>
                         </TableCell>
                         <TableCell align="center">
                           <TableSortLabel
                             active={heapOrderBy === 'has_clustered_index'}
                             direction={heapOrderBy === 'has_clustered_index' ? heapOrder : 'asc'}
                             onClick={() => handleHeapSort('has_clustered_index')}
                           >
                             Index Cluster
                           </TableSortLabel>
                         </TableCell>
                         <TableCell align="center">Actions</TableCell>
                       </TableRow>
                     </TableHead>
                     <TableBody>
                       {sortedHeapTables
                         .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                         .map((table, index) => (
                           <TableRow key={index}>
                             <TableCell>
                               <Box display="flex" alignItems="center" gap={1}>
                                 <TableIcon color="info" />
                                 {table.table_name}
                               </Box>
                             </TableCell>
                             <TableCell>
                               <Chip 
                                 label={table.connection_name} 
                                 size="small" 
                                 color={getConnectionTypeColor(table.connection_type)}
                               />
                             </TableCell>
                             <TableCell>{table.database_name}</TableCell>
                             <TableCell>{table.schema_name}</TableCell>
                             <TableCell align="right">
                               <Chip 
                                 label={formatRowCount(table.row_count)} 
                                 color="info" 
                                 size="small" 
                               />
                             </TableCell>
                             <TableCell align="right">{formatSize(table.size_mb)}</TableCell>
                             <TableCell align="center">
                               <Chip 
                                 label={table.has_clustered_index ? "Oui" : "Non"} 
                                 color={table.has_clustered_index ? "success" : "error"} 
                                 size="small" 
                               />
                             </TableCell>
                             <TableCell align="center">
                               <Box display="flex" gap={1} justifyContent="center">
                                 <Tooltip title="Voir le code DDL">
                                   <IconButton
                                     size="small"
                                     color="secondary"
                                     onClick={() => handleViewDDL(table)}
                                   >
                                     <DdlIcon />
                                   </IconButton>
                                 </Tooltip>
                                 <Tooltip title="Voir les dépendances">
                                   <IconButton
                                     size="small"
                                     color="info"
                                     onClick={() => handleViewDependencies(table)}
                                   >
                                     <DependenciesIcon />
                                   </IconButton>
                                 </Tooltip>
                                 <Tooltip title="Voir les données">
                                   <IconButton
                                     size="small"
                                     color="success"
                                     onClick={() => handleViewTableData(table)}
                                   >
                                     <DataIcon />
                                   </IconButton>
                                 </Tooltip>
                                 <Tooltip title={hasComment(table) ? "Modifier le commentaire" : "Ajouter un commentaire"}>
                                   <IconButton
                                     size="small"
                                     color={hasComment(table) ? "success" : "primary"}
                                     onClick={() => handleAddComment(table)}
                                     sx={{
                                       position: 'relative',
                                       '&::after': hasComment(table) ? {
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

                                 <TablePagination
                   component="div"
                   count={heapTables.length}
                   page={page}
                   onPageChange={handleChangePage}
                   rowsPerPage={rowsPerPage}
                   onRowsPerPageChange={handleChangeRowsPerPage}
                   labelRowsPerPage="Lignes par page"
                 />
              </CardContent>
            </Card>
          )}
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
              Code DDL - {selectedObject?.object_name || selectedObject?.table_name}
              <Typography variant="body2" color="textSecondary">
                {selectedObject?.database_name} • {selectedObject?.object_type || 'TABLE'} • {selectedObject?.schema_name}
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
              Objet : {selectedObjectForComment?.object_name || selectedObjectForComment?.table_name} ({selectedObjectForComment?.object_type || 'TABLE'})
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
                Dépendances - {selectedObjectForDependencies?.object_name || selectedObjectForDependencies?.table_name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {selectedObjectForDependencies?.database_name} • {selectedObjectForDependencies?.object_type || 'TABLE'}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {dependenciesLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" py={4}>
              <LinearProgress sx={{ width: '100%', mb: 2 }} />
              <Typography variant="body2" color="textSecondary" align="center">
                Récupération des dépendances en cours...
              </Typography>
            </Box>
          ) : dependencies.length > 0 ? (
            <List>
              {dependencies.map((dependency, index) => (
                <React.Fragment key={index}>
                  <ListItem>
                    <ListItemIcon>
                      <DependenciesIcon color="info" />
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
                            color="info"
                            variant="outlined"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            Schéma : {dependency.parent_schema || 'N/A'} • Table : {dependency.parent_table}
                          </Typography>
                          {dependency.description && (
                            <Typography variant="body2" color="textSecondary">
                              {dependency.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <IconButton
                      size="small"
                      onClick={() => handleViewDependencyDDL(dependency)}
                    >
                      <DdlIcon />
                    </IconButton>
                  </ListItem>
                  {index < dependencies.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Box textAlign="center" py={4}>
              <Typography variant="body2" color="textSecondary">
                Aucune dépendance trouvée
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

      {/* Dialogue DDL de Dépendance */}
      <Dialog
        open={dependencyDdlDialogOpen}
        onClose={() => setDependencyDdlDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              Code DDL - {selectedDependency?.dependency_name}
              <Typography variant="body2" color="textSecondary">
                {selectedDependency?.database_name} • {selectedDependency?.dependency_type} • {selectedDependency?.parent_schema}
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
                Récupération du code DDL en cours...
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

      {/* Dialogue Données de Table */}
      <Dialog
        open={dataDialogOpen}
        onClose={() => setDataDialogOpen(false)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <DataIcon />
              <Box>
                <Typography variant="h6">
                  Données - {selectedTable?.object_name || selectedTable?.table_name}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {selectedTable?.database_name} • {selectedTable?.schema_name}
                </Typography>
              </Box>
            </Box>
            <Box display="flex" gap={1}>
              <Button
                size="small"
                onClick={() => {
                  const csvContent = generateCSV(tableData.columns, tableData.data);
                  const blob = new Blob([csvContent], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selectedTable?.object_name || selectedTable?.table_name}_data.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setCsvExportSuccess(true);
                  setTimeout(() => setCsvExportSuccess(false), 2000);
                }}
                disabled={tableData.data.length === 0}
                color={csvExportSuccess ? "success" : "primary"}
                variant={csvExportSuccess ? "contained" : "outlined"}
                startIcon={<CopyIcon />}
              >
                {csvExportSuccess ? "Exporté !" : "Export CSV"}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const sqlQuery = generateSQLQuery(selectedTable, 200);
                  navigator.clipboard.writeText(sqlQuery);
                  setSqlCopySuccess(true);
                  setTimeout(() => setSqlCopySuccess(false), 2000);
                }}
                disabled={tableData.data.length === 0}
                color={sqlCopySuccess ? "success" : "primary"}
                variant={sqlCopySuccess ? "contained" : "outlined"}
              >
                {sqlCopySuccess ? "Copié !" : "Copier SQL"}
              </Button>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {dataLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" py={4}>
              <LinearProgress sx={{ width: '100%', mb: 2 }} />
              <Typography variant="body2" color="textSecondary" align="center">
                Récupération des données en cours...
              </Typography>
            </Box>
          ) : tableData.columns.length > 0 ? (
            <Box>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {tableData.columns.map((column, index) => (
                        <TableCell key={index}>{column.name}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableData.data.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {tableData.columns.map((column, colIndex) => (
                          <TableCell key={colIndex}>
                            {row[column.name] !== null && row[column.name] !== undefined 
                              ? String(row[column.name]) 
                              : <em>NULL</em>
                            }
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
                onPageChange={(e, newPage) => setDataPage(newPage)}
                rowsPerPage={dataRowsPerPage}
                onRowsPerPageChange={(e) => setDataRowsPerPage(parseInt(e.target.value, 10))}
                labelRowsPerPage="Lignes par page"
              />
            </Box>
          ) : (
            <Box textAlign="center" py={4}>
              <Typography variant="body2" color="textSecondary">
                Aucune donnée disponible
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

export default Maintenance; 