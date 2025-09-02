import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Folder as FolderIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { settingsAPI } from '../services/api';

const Settings = () => {
  const [dtsxPath, setDtsxPath] = useState('');
  const [currentDtsxPath, setCurrentDtsxPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Charger les paramètres au montage du composant
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await settingsAPI.getSettings();
      setDtsxPath(response.data.dtsxPath || '');
      setCurrentDtsxPath(response.data.currentDtsxPath || '');
    } catch (err) {
      setError('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      await settingsAPI.updateSettings({
        dtsxPath: dtsxPath.trim()
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde des paramètres');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <SettingsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h5" component="h1">
          Paramètres
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Paramètres sauvegardés avec succès !
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Configuration DTSX
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Configurez le chemin vers les fichiers DTSX pour permettre la recherche dans les packages SSIS.
          </Typography>

                     <Grid container spacing={3}>
             <Grid item xs={12}>
               <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                 Chemin actuel : {currentDtsxPath || 'Non défini'}
               </Typography>
             </Grid>
             <Grid item xs={12} md={8}>
               <TextField
                 fullWidth
                 label="Nouveau chemin des fichiers DTSX"
                 value={dtsxPath}
                 onChange={(e) => setDtsxPath(e.target.value)}
                 placeholder="C:\Chemin\Vers\Fichiers\DTSX"
                 helperText="Chemin absolu vers le dossier contenant les fichiers .dtsx"
                 InputProps={{
                   startAdornment: <FolderIcon sx={{ mr: 1, color: 'action.active' }} />,
                 }}
               />
             </Grid>
             <Grid item xs={12} md={4}>
               <Button
                 fullWidth
                 variant="contained"
                 startIcon={<SaveIcon />}
                 onClick={handleSave}
                 disabled={loading}
                 sx={{ height: 56 }}
               >
                 {loading ? 'Sauvegarde...' : 'Sauvegarder'}
               </Button>
             </Grid>
           </Grid>

          <Box mt={2}>
            <Typography variant="body2" color="text.secondary">
              <strong>Note :</strong> Le chemin doit être accessible par l'application et contenir des fichiers .dtsx valides.
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Informations système
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Version de l'application et informations techniques.
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2">
            <strong>Version :</strong> 1.0.0
          </Typography>
          <Typography variant="body2">
            <strong>Environnement :</strong> {process.env.NODE_ENV}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Settings;
