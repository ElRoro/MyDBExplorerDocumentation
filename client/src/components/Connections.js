import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Alert,
  LinearProgress,
  Divider,
  FormHelperText,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as TestIcon,
  Storage as StorageIcon,
  Upload as UploadIcon,
  Key as KeyIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
} from '@mui/icons-material';
import { connectionsAPI } from '../services/api';
import axios from 'axios';
import * as XLSX from 'xlsx';

const ConnectionForm = ({ open, onClose, connection = null, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'sqlserver',
    host: '',
    port: 1433,
    username: '',
    password: '',
    database: '',
    enabled: true,
    ssh_enabled: false,
    ssh_host: '',
    ssh_port: 22,
    ssh_username: '',
    ssh_password: '',
    ssh_private_key: '',
    ssh_key_passphrase: '',
  });

  const [loading, setLoading] = useState(false);
  const [sshAuthMethod, setSshAuthMethod] = useState('password'); // 'password' ou 'key'
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (connection) {
      setFormData({
        name: connection.name || '',
        type: connection.type || 'sqlserver',
        host: connection.host || '',
        port: connection.port || 1433,
        username: connection.username || '',
        password: connection.password || '',
        database: connection.database || '',
        enabled: connection.enabled || true,
        ssh_enabled: connection.ssh_enabled || false,
        ssh_host: connection.ssh_host || '',
        ssh_port: connection.ssh_port || 22,
        ssh_username: connection.ssh_username || '',
        ssh_password: connection.ssh_password || '',
        ssh_private_key: connection.ssh_private_key || '',
        ssh_key_passphrase: connection.ssh_key_passphrase || '',
      });
      
      // Déterminer la méthode d'authentification SSH
      if (connection.ssh_private_key && connection.ssh_private_key.trim()) {
        setSshAuthMethod('key');
      } else {
        setSshAuthMethod('password');
      }
    } else {
      // Réinitialiser pour une nouvelle connexion
      setFormData({
        name: '',
        type: 'sqlserver',
        host: '',
        port: 1433,
        username: '',
        password: '',
        database: '',
        enabled: true,
        ssh_enabled: false,
        ssh_host: '',
        ssh_port: 22,
        ssh_username: '',
        ssh_password: '',
        ssh_private_key: '',
        ssh_key_passphrase: '',
      });
      setSshAuthMethod('password');
    }
  }, [connection]);

  const handleChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => {
      const newData = {
        ...prev,
        [field]: value,
      };
      
      // Si on change le type de base de données, mettre à jour le port par défaut
      if (field === 'type') {
        // Si pas de port ou si c'est un port par défaut, le mettre à jour
        const currentPort = prev.port;
        const defaultPort = getDefaultPort(value);
        const isDefaultPort = [1433, 3306].includes(currentPort);
        
        if (!currentPort || isDefaultPort) {
          newData.port = defaultPort;
        }
      }
      
      return newData;
    });
  };

  const handleFileImport = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData(prev => ({
          ...prev,
          ssh_private_key: e.target.result
        }));
      };
      reader.readAsText(file);
    }
  };

  const handleImportKey = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (connection) {
        await connectionsAPI.update(connection.id, formData);
      } else {
        await connectionsAPI.create(formData);
      }
      onSave();
      onClose();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultPort = (type) => {
    switch (type) {
      case 'sqlserver': return 1433;
      case 'mysql': return 3306;
      case 'mariadb': return 3306;
      default: return 1433;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {connection ? 'Modifier la connexion' : 'Nouvelle connexion'}
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Nom de la connexion"
              value={formData.name}
              onChange={handleChange('name')}
              required
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth required>
              <InputLabel>Type de base de données</InputLabel>
              <Select
                value={formData.type}
                onChange={handleChange('type')}
                label="Type de base de données"
              >
                <MenuItem value="sqlserver">SQL Server</MenuItem>
                <MenuItem value="mysql">MySQL</MenuItem>
                <MenuItem value="mariadb">MariaDB</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Hôte"
              value={formData.host}
              onChange={handleChange('host')}
              required
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Port"
              type="number"
              value={formData.port}
              onChange={handleChange('port')}
              required
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Nom d'utilisateur"
              value={formData.username}
              onChange={handleChange('username')}
              required
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Mot de passe"
              type="password"
              value={formData.password}
              onChange={handleChange('password')}
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Base de données (optionnel)"
              value={formData.database}
              onChange={handleChange('database')}
            />
          </Grid>
          
          <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.ssh_enabled}
                  onChange={handleChange('ssh_enabled')}
                />
              }
              label="Utiliser une connexion SSH"
            />
          </Grid>
          
          {formData.ssh_enabled && (
            <>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Hôte SSH"
                  value={formData.ssh_host}
                  onChange={handleChange('ssh_host')}
                  required={formData.ssh_enabled}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Port SSH"
                  type="number"
                  value={formData.ssh_port}
                  onChange={handleChange('ssh_port')}
                  required={formData.ssh_enabled}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Utilisateur SSH"
                  value={formData.ssh_username}
                  onChange={handleChange('ssh_username')}
                  required={formData.ssh_enabled}
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Méthode d'authentification SSH</InputLabel>
                  <Select
                    value={sshAuthMethod}
                    onChange={(e) => setSshAuthMethod(e.target.value)}
                    label="Méthode d'authentification SSH"
                  >
                    <MenuItem value="password">Mot de passe</MenuItem>
                    <MenuItem value="key">Clé publique</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              {sshAuthMethod === 'password' && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Mot de passe SSH"
                    type="password"
                    value={formData.ssh_password}
                    onChange={handleChange('ssh_password')}
                  />
                </Grid>
              )}
              
              {sshAuthMethod === 'key' && (
                <>
                  <Grid item xs={12}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <KeyIcon color="action" />
                        <Typography variant="body2" color="textSecondary">
                          Clé privée SSH
                        </Typography>
                      </Box>
                      <Box display="flex" gap={1} mb={1}>
                        <Button
                          variant="outlined"
                          startIcon={<UploadIcon />}
                          onClick={handleImportKey}
                          size="small"
                        >
                          Importer un fichier
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pem,.key,.ppk,.txt"
                          onChange={handleFileImport}
                          style={{ display: 'none' }}
                        />
                      </Box>
                      <TextField
                        fullWidth
                        label="Contenu de la clé privée"
                        multiline
                        rows={6}
                        value={formData.ssh_private_key}
                        onChange={handleChange('ssh_private_key')}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;Votre clé privée ici...&#10;-----END RSA PRIVATE KEY-----"
                      />
                      <FormHelperText>
                        Formats supportés : .pem, .key, .ppk, .txt. Vous pouvez aussi coller directement le contenu de votre clé.
                      </FormHelperText>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Passphrase de la clé (optionnel)"
                      type="password"
                      value={formData.ssh_key_passphrase || ''}
                      onChange={handleChange('ssh_key_passphrase')}
                      placeholder="Laissez vide si votre clé n'a pas de passphrase"
                    />
                    <FormHelperText>
                      Mot de passe pour déchiffrer votre clé privée si elle est protégée
                    </FormHelperText>
                  </Grid>
                </>
              )}
            </>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Box flexGrow={1} display="flex" justifyContent="flex-end" alignItems="center">
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(formData.enabled)}
                onChange={handleChange('enabled')}
                color="success"
              />
            }
            label="Connexion activée"
            sx={{ mr: 2 }}
          />
          <Button onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={loading || !formData.name || !formData.host || !formData.username}
          >
            {loading ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

const ConnectionCard = ({ connection, onEdit, onDelete, onTest, onToggle }) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [toggling, setToggling] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await connectionsAPI.test(connection.id);
      setTestResult(response.data);
    } catch (error) {
      setTestResult({ success: false, message: error.response?.data?.error || 'Erreur de test' });
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggle(connection.id);
    } catch (error) {
      console.error('Erreur lors du basculement:', error);
    } finally {
      setToggling(false);
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'sqlserver': return 'primary';
      case 'mysql': return 'success';
      case 'mariadb': return 'warning';
      default: return 'default';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'sqlserver': return 'SQL Server';
      case 'mysql': return 'MySQL';
      case 'mariadb': return 'MariaDB';
      default: return type;
    }
  };

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center">
            <StorageIcon sx={{ mr: 1 }} />
            <Typography variant="h6">{connection.name}</Typography>
          </Box>
          <Box display="flex" gap={1}>
            <Chip
              label={getTypeLabel(connection.type)}
              color={getTypeColor(connection.type)}
              size="small"
            />
          </Box>
        </Box>
        
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {connection.host}:{connection.port}
        </Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Utilisateur: {connection.username}
        </Typography>
        {connection.ssh_enabled === 1 && (
          <Chip label="SSH" color="secondary" size="small" sx={{ mt: 1 }} />
        )}
        
        {testResult && (
          <Alert
            severity={testResult.success ? 'success' : 'error'}
            sx={{ mt: 2 }}
          >
            {testResult.message}
          </Alert>
        )}
      </CardContent>
      
      <CardActions>
        <Button
          size="small"
          startIcon={<TestIcon />}
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? 'Test...' : 'Tester'}
        </Button>
        <Button
          size="small"
          startIcon={<EditIcon />}
          onClick={() => onEdit(connection)}
        >
          Modifier
        </Button>
        <IconButton
          size="small"
          color="error"
          onClick={() => onDelete(connection.id)}
        >
          <DeleteIcon />
        </IconButton>
        <Box flexGrow={1} />
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(connection.enabled)}
              onChange={async () => {
                setToggling(true);
                await onToggle(connection.id);
                setToggling(false);
              }}
              disabled={toggling}
              color="success"
              size="small"
            />
          }
          label={Boolean(connection.enabled) ? 'Activée' : 'Désactivée'}
          sx={{ ml: 1 }}
        />
      </CardActions>
    </Card>
  );
};

const InformationsBloc = ({ connections }) => {
  // On ne garde que les connexions actives
  const activeConnections = connections.filter(conn => conn.enabled);
  const [infos, setInfos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shown, setShown] = useState(false);
  const [expandedBases, setExpandedBases] = useState({}); // { [connectionId]: { [baseName]: bool } }

  const toggleBase = (connectionId, baseName) => {
    setExpandedBases(prev => ({
      ...prev,
      [connectionId]: {
        ...(prev[connectionId] || {}),
        [baseName]: !((prev[connectionId] || {})[baseName])
      }
    }));
  };

  const fetchInfos = () => {
    setLoading(true);
    setError(null);
    Promise.all(
      activeConnections.map(conn =>
        axios.get(`/api/connections/${conn.id}/info`).then(r => ({ id: conn.id, data: r.data })).catch(e => ({ id: conn.id, error: e.message }))
      )
    )
      .then(results => setInfos(results))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  const handleShow = () => {
    setShown(true);
    fetchInfos();
  };

  const exportTablesCSV = (info) => {
    if (!info || !info.databases) return;
    let csv = 'Base,Table,Schéma,Nombre de lignes,Taille (Mo)\n';
    info.databases.forEach(base => {
      base.tables.forEach(table => {
        csv += `"${base.name}","${table.name}","${table.schema}",${table.row_count},${table.size_mb}\n`;
      });
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tables_${info.connection.name}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAllExcel = () => {
    if (!infos || infos.length === 0) return;
    const wb = XLSX.utils.book_new();

    // --- Onglet Résumé ---
    let resumeRows = [];
    // En-tête
    resumeRows.push([
      'Serveur', 'Type', 'Version', 'Base', 'Volume (Mo)', 'Nombre de tables', 'Moy. variation datas quotidiennes'
    ]);
    infos.forEach((infoObj) => {
      if (infoObj.error) return;
      const info = infoObj.data;
      info.databases.forEach(base => {
        resumeRows.push([
          info.connection.name,
          info.connection.type,
          info.version,
          base.name,
          Number(base.volume_mb).toFixed(2),
          base.tables_count,
          typeof base.avg_backup_variation_pourcent === 'number' ? base.avg_backup_variation_pourcent.toFixed(2) + ' %' : 'Non disponible'
        ]);
      });
    });
    const wsResume = XLSX.utils.aoa_to_sheet(resumeRows);
    wsResume['!cols'] = [
      { width: 25 }, // Serveur
      { width: 12 }, // Type
      { width: 15 }, // Version
      { width: 25 }, // Base
      { width: 15 }, // Volume
      { width: 15 }, // Nb tables
      { width: 30 }  // Variation
    ];
    XLSX.utils.book_append_sheet(wb, wsResume, 'Résumé');
    
    infos.forEach((infoObj) => {
      if (infoObj.error) return;
      const info = infoObj.data;
      let rows = [];
      
      // Informations du serveur regroupées dans une seule cellule
      const serverInfo = `Nom: ${info.connection.name}\r\nType: ${info.connection.type}\r\nVersion: ${info.version}\r\nNombre de bases: ${info.databases_count}\r\nVolume total: ${info.total_volume_mb} Mo`;
      
      // En-tête avec informations du serveur
      rows.push([serverInfo, '']); // On met le texte dans A1, B1 vide
      rows.push([]);
      
      // Pour chaque base, ajouter une ligne de résumé puis le tableau des tables
      info.databases.forEach(base => {
        // Ligne de résumé
        const resume = `${base.name} : ${Number(base.volume_mb).toFixed(2)} Mo, ${base.tables_count} tables • Moy. variation datas quotidiennes : ${typeof base.avg_backup_variation_pourcent === 'number' ? base.avg_backup_variation_pourcent.toFixed(2) + ' %' : 'Non disponible'}`;
        rows.push([resume]);
        rows.push([]);
        // En-tête colonnes des tables
        rows.push(['Base', 'Table', 'Schéma', 'Nombre de lignes', 'Taille (Mo)']);
        // Données des tables
        base.tables.forEach(table => {
          rows.push([
            base.name,
            table.name,
            table.schema,
            table.row_count,
            table.size_mb
          ]);
        });
        rows.push([]);
      });
      
      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Forcer wrapText sur A1
      if (ws['A1']) {
        ws['A1'].s = {
          ...(ws['A1'].s || {}),
          alignment: { wrapText: true, vertical: 'center' }
        };
      }
      
      // Styles pour rendre le fichier plus joli
      const range = XLSX.utils.decode_range(ws['!ref']);
      
      // Appliquer des styles à toutes les cellules
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_address = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cell_address]) continue;
          
          // Style de base pour toutes les cellules
          ws[cell_address].s = {
            font: { name: 'Calibri', sz: 11 },
            alignment: { vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: 'CCCCCC' } },
              bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
              left: { style: 'thin', color: { rgb: 'CCCCCC' } },
              right: { style: 'thin', color: { rgb: 'CCCCCC' } }
            }
          };
          // Forcer le retour à la ligne dans la cellule des infos serveur
          if (R === 0 && C === 1) {
            ws[cell_address].s = {
              ...ws[cell_address].s,
              alignment: { wrapText: true, vertical: 'center' }
            };
          }
          
          // Style spécial pour l'en-tête des informations du serveur
          if (R === 0) {
            ws[cell_address].s = {
              ...ws[cell_address].s,
              font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: '4472C4' } },
              alignment: { horizontal: 'center', vertical: 'center' }
            };
          }
          
          // Style pour les en-têtes des colonnes de tables
          if (R >= 3) {
            const baseStartRows = [];
            let currentRow = 3;
            info.databases.forEach(base => {
              baseStartRows.push(currentRow);
              currentRow += base.tables.length + 2; // +2 pour l'en-tête et la ligne vide
            });
            
            if (baseStartRows.includes(R)) {
              ws[cell_address].s = {
                ...ws[cell_address].s,
                font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
                fill: { fgColor: { rgb: '70AD47' } },
                alignment: { horizontal: 'center', vertical: 'center' }
              };
            }
          }
        }
      }
      
      // Fusionner les cellules pour l'en-tête des informations du serveur
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }
      ];
      
      // Ajuster la largeur des colonnes
      ws['!cols'] = [
        { width: 25 }, // Colonne A
        { width: 80 }, // Colonne B (plus large pour infos serveur)
        { width: 20 }, // Colonne C (Base)
        { width: 25 }, // Colonne D (Table)
        { width: 15 }, // Colonne E (Schéma)
        { width: 15 }, // Colonne F (Nombre de lignes)
        { width: 15 }  // Colonne G (Taille)
      ];
      
      // Ajuster la hauteur des lignes
      ws['!rows'] = [];
      for (let i = 0; i <= range.e.r; i++) {
        ws['!rows'][i] = { hpt: i === 0 ? 30 : 20 }; // Plus grande hauteur pour l'en-tête
      }
      
      XLSX.utils.book_append_sheet(wb, ws, info.connection.name.substring(0, 31)); // Excel limite à 31 caractères
    });
    
    XLSX.writeFile(wb, 'informations_techniques_connexions.xlsx');
  };

  if (!shown) {
    return (
      <Box my={4} textAlign="center">
        <Button variant="contained" onClick={handleShow}>
          Afficher les informations techniques
        </Button>
      </Box>
    );
  }

  if (loading) return <Box my={4}><LinearProgress /><Typography>Chargement des informations techniques...</Typography></Box>;
  if (error) return <Alert severity="error">Erreur lors du chargement des informations : {error}</Alert>;
  if (!infos || infos.length === 0) return null;

  return (
    <Box my={4}>
      <Box display="flex" justifyContent="flex-end" mb={2}>
        <Button variant="contained" color="success" onClick={exportAllExcel} disabled={!infos || infos.length === 0}>
          Exporter tout (Excel)
        </Button>
      </Box>
      <Typography variant="h5" gutterBottom>Informations techniques</Typography>
      {infos.map((infoObj, idx) => {
        if (infoObj.error) {
          return <Alert severity="error" key={infoObj.id}>Erreur pour la connexion {infoObj.id} : {infoObj.error}</Alert>;
        }
        const info = infoObj.data;
        return (
          <Card key={info.connection.id} sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" gutterBottom>{info.connection.name} ({info.connection.type})</Typography>
                <Button size="small" variant="outlined" onClick={() => exportTablesCSV(info)}>
                  Exporter (CSV)
                </Button>
              </Box>
              <Typography variant="body2">Version : {info.version}</Typography>
              <Typography variant="body2">Nombre de bases : {info.databases_count}</Typography>
              <Typography variant="body2">Volume total : {info.total_volume_mb} Mo</Typography>
              {info.databases && info.databases.length > 0 && (
                <Box mt={2}>
                  <Typography variant="subtitle1">Bases :</Typography>
                  <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                    {info.databases.map(base => {
                      const expanded = expandedBases[info.connection.id]?.[base.name] || false;
                      return (
                        <li key={base.name}>
                          <Box display="flex" alignItems="center">
                            <IconButton size="small" onClick={() => toggleBase(info.connection.id, base.name)}>
                              {expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                            </IconButton>
                            <Box flexGrow={1}>
                              <strong>{base.name}</strong> : {base.volume_mb} Mo, {base.tables_count} tables
                              <span> • Moy. variation datas quotidiennes : {typeof base.avg_backup_variation_pourcent === 'number' ? (base.avg_backup_variation_pourcent).toFixed(2) + ' %' : 'Non disponible'}</span>
                            </Box>
                          </Box>
                          {expanded && base.tables && base.tables.length > 0 && (
                            <ul style={{ marginLeft: 32 }}>
                              {base.tables.map(table => (
                                <li key={table.name + '-' + table.schema}>
                                  {table.name} (schéma : {table.schema}) : {table.row_count} lignes, {table.size_mb} Mo
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
};

const Connections = () => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const response = await connectionsAPI.getAll();
      setConnections(response.data);
    } catch (err) {
      setError('Erreur lors du chargement des connexions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleAdd = () => {
    setEditingConnection(null);
    setDialogOpen(true);
  };

  const handleEdit = (connection) => {
    setEditingConnection(connection);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette connexion ?')) {
      try {
        await connectionsAPI.delete(id);
        fetchConnections();
      } catch (err) {
        setError('Erreur lors de la suppression');
      }
    }
  };

  const handleSave = () => {
    fetchConnections();
  };

  if (loading) {
    return <LinearProgress />;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Gestion des connexions</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAdd}
        >
          Nouvelle connexion
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {connections
          .sort((a, b) => {
            // Trier par statut : activées en premier, puis par nom
            if (a.enabled !== b.enabled) {
              return b.enabled ? 1 : -1; // Activées en premier
            }
            return a.name.localeCompare(b.name); // Puis par ordre alphabétique
          })
          .map((connection) => (
            <Grid item xs={12} md={6} lg={4} key={connection.id}>
              <ConnectionCard
                connection={connection}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggle={async (id) => {
                  try {
                    await connectionsAPI.toggle(id);
                    fetchConnections();
                  } catch (error) {
                    console.error('Erreur lors du basculement:', error);
                  }
                }}
              />
            </Grid>
          ))}
      </Grid>

      {connections.length === 0 && !loading && (
        <Box textAlign="center" py={4}>
          <Typography variant="h6" color="textSecondary">
            Aucune connexion configurée
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Ajoutez votre première connexion pour commencer
          </Typography>
        </Box>
      )}

      {/* Bloc Informations techniques */}
      <InformationsBloc connections={connections} />

      <ConnectionForm
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        connection={editingConnection}
        onSave={handleSave}
      />
    </Box>
  );
};

export default Connections; 