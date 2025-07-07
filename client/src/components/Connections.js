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
} from '@mui/icons-material';
import { connectionsAPI } from '../services/api';

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
        {connections.map((connection) => (
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