import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  Fab,
  Tooltip,
  Stack,
  Tabs,
  Tab,
  InputAdornment,
  OutlinedInput,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Code as CodeIcon,
  Storage as StorageIcon,
  Tag as TagIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Note as NoteIcon,
} from '@mui/icons-material';
import { notesAPI, connectionsAPI } from '../services/api';

function Notes() {
  const location = useLocation();

  // Vérifier si on doit ouvrir le dialogue d'ajout
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('action') === 'new') {
      openDialog();
      // Nettoyer l'URL après l'ouverture du dialogue
      window.history.replaceState({}, '', '/notes');
    }
  }, [location]);
  const [notes, setNotes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // État pour le dialogue d'édition
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    contents: [{ id: 1, content: '', type: 'text' }],
    connection_id: '',
    database_name: '',
    tags: ''
  });

  // État pour la recherche et filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConnection, setSelectedConnection] = useState('');
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [availableDatabases, setAvailableDatabases] = useState([]);
  const [activeTab, setActiveTab] = useState(0);

  // Charger les données
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [notesRes, connectionsRes] = await Promise.all([
        notesAPI.getAll(),
        connectionsAPI.getActiveConnections()
      ]);
      
      const notes = notesRes.data;
      setNotes(notes);
      
      // S'assurer que les connexions sont un tableau
      setConnections(Array.isArray(connectionsRes.data) ? connectionsRes.data : []);

      // Extraire tous les tags uniques des notes
      const allTags = new Set();
      notes.forEach(note => {
        if (note.tags) {
          note.tags.split(',').forEach(tag => {
            allTags.add(tag.trim());
          });
        }
      });
      setAvailableTags(Array.from(allTags).sort());
    } catch (err) {
      setError('Erreur lors du chargement des données');
      console.error('Erreur de chargement:', err);
    } finally {
      setLoading(false);
    }
  };

  // Recherche et filtrage
  useEffect(() => {
    const fetchFilteredNotes = async () => {
      try {
        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        if (selectedConnection) params.append('connection_id', selectedConnection);
        if (selectedDatabase) params.append('database_name', selectedDatabase);
        if (selectedTags.length > 0) params.append('tags', selectedTags.join(','));

        const response = await notesAPI.search(params);
        setNotes(response.data);
      } catch (err) {
        setError('Erreur lors de la recherche');
        console.error('Erreur de recherche:', err);
      }
    };

    const timeoutId = setTimeout(fetchFilteredNotes, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, selectedConnection, selectedDatabase, selectedTags]);

  // Générer des tags à partir du titre
  const generateTagsFromTitle = (title) => {
    if (!title) return '';
    // Diviser le titre en mots et filtrer les mots courts
    const words = title.toLowerCase()
      .split(/[\s,.-]+/)
      .filter(word => word.length > 2);
    // Retourner les mots uniques comme tags
    return [...new Set(words)].join(', ');
  };

  // Charger les bases de données pour une connexion
  const loadDatabases = async (connectionId) => {
    if (!connectionId) {
      setAvailableDatabases([]);
      setSelectedDatabase('');
      return;
    }

    try {
      const response = await connectionsAPI.getDatabases(connectionId);
      
      // Extraire les bases de données uniques des notes pour ce serveur
      const dbsFromNotes = new Set(
        notes
          .filter(note => note.connection_id === connectionId && note.database_name)
          .map(note => note.database_name)
      );
      
      // Combiner avec les bases de données disponibles
      const allDbs = new Set([...response.data, ...dbsFromNotes]);
      setAvailableDatabases(Array.from(allDbs).sort());
    } catch (err) {
      console.error('Erreur lors du chargement des bases de données:', err);
      setError('Erreur lors du chargement des bases de données');
      setAvailableDatabases([]);
    }
  };

  // Gestion du formulaire
  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Générer automatiquement les tags quand le titre change
    if (field === 'title') {
      const autoTags = generateTagsFromTitle(value);
      setFormData(prev => ({ ...prev, tags: autoTags }));
    }

    // Charger les bases de données quand une connexion est sélectionnée
    if (field === 'connection_id') {
      loadDatabases(value);
      // Réinitialiser la base de données sélectionnée
      setFormData(prev => ({ ...prev, database_name: '' }));
    }
  };

  // Gestion des contenus multiples
  const addContent = () => {
    const newId = Math.max(...formData.contents.map(c => c.id), 0) + 1;
    setFormData(prev => ({
      ...prev,
      contents: [...prev.contents, { id: newId, content: '', type: 'text' }]
    }));
  };

  const removeContent = (id) => {
    if (formData.contents.length > 1) {
      setFormData(prev => ({
        ...prev,
        contents: prev.contents.filter(c => c.id !== id)
      }));
    }
  };

  const updateContent = (id, content) => {
    setFormData(prev => ({
      ...prev,
      contents: prev.contents.map(c => 
        c.id === id ? { ...c, content } : c
      )
    }));
  };

  const resetForm = () => {
    setFormData({
      title: '',
      contents: [{ id: 1, content: '', type: 'text' }],
      connection_id: '',
      database_name: '',
      tags: ''
    });
    setEditingNote(null);
  };

  const openDialog = async (note = null) => {
    if (note) {
      setEditingNote(note);
      // Convertir l'ancien format content vers le nouveau format contents
      const contents = note.content.split('\n\n---\n\n').map((content, index) => ({
        id: index + 1,
        content,
        type: 'text'
      }));

      // Charger les bases de données si une connexion est sélectionnée
      if (note.connection_id) {
        await loadDatabases(note.connection_id);
      }

      setFormData({
        title: note.title,
        contents,
        connection_id: note.connection_id || '',
        database_name: note.database_name || '',
        tags: note.tags || ''
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async () => {
    try {
      // Convertir le format contents vers content pour l'API
      const content = formData.contents.map(c => c.content).join('\n\n---\n\n');
      
      const dataToSend = {
        title: formData.title,
        content,
        connection_id: formData.connection_id,
        database_name: formData.database_name,
        tags: formData.tags
      };

      if (editingNote) {
        await notesAPI.update(editingNote.id, dataToSend);
        setSuccess('Note mise à jour avec succès');
      } else {
        await notesAPI.create(dataToSend);
        setSuccess('Note créée avec succès');
      }
      
      closeDialog();
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde');
      console.error('Erreur de sauvegarde:', err);
    }
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette note ?')) {
      return;
    }

    try {
      await notesAPI.deleteNote(noteId);
      setSuccess('Note supprimée avec succès');
      loadData();
    } catch (err) {
      setError('Erreur lors de la suppression');
      console.error('Erreur de suppression:', err);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateContent = (content, maxLines = 5) => {
    const lines = content.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + '\n[...]';
    }
    return content;
  };

  const renderNoteCard = (note) => (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 3 }}>
      <CardContent sx={{ p: 3, flex: 1 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Typography variant="h6" component="h3" sx={{ fontWeight: 'bold' }}>
            {note.title}
          </Typography>
          <Box>
            <IconButton size="small" onClick={() => openDialog(note)}>
              <EditIcon />
            </IconButton>
            <IconButton size="small" onClick={() => handleDelete(note.id)} color="error">
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>

        {note.content && (
          <Box sx={{ mb: 2 }}>
            {note.content.split('\n\n---\n\n').map((content, index) => (
              <Box key={index} sx={{ mb: index > 0 ? 2 : 0 }}>
                {index > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    --- Contenu {index + 1} ---
                  </Typography>
                )}
                <Box sx={{ position: 'relative' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ 
                    whiteSpace: 'pre-wrap', 
                    fontFamily: 'monospace',
                    backgroundColor: '#f5f5f5',
                    padding: 1,
                    borderRadius: 1
                  }}>
                    {truncateContent(content)}
                  </Typography>
                  {content.split('\n').length > 5 && (
                    <Button
                      size="small"
                      onClick={() => openDialog(note)}
                      sx={{ mt: 1 }}
                    >
                      Voir plus...
                    </Button>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
          {note.connection_name && (
            <Chip
              icon={<StorageIcon />}
              label={note.connection_name}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          {note.database_name && (
            <Chip
              icon={<StorageIcon />}
              label={note.database_name}
              size="small"
              color="info"
              variant="outlined"
            />
          )}
          {note.tags && note.tags.split(',').map((tag, index) => (
            <Chip
              key={index}
              icon={<TagIcon />}
              label={tag.trim()}
              size="small"
              color="secondary"
              variant="outlined"
            />
          ))}
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Modifié le {formatDate(note.updated_at)}
        </Typography>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <NoteIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h5" component="h1">
          Notes
        </Typography>
      </Box>

      {/* Filtres et recherche */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={selectedConnection ? 3 : 4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Rechercher dans les notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={selectedConnection ? 3 : 4}>
            <FormControl fullWidth size="small">
              <InputLabel>Tags</InputLabel>
              <Select
                multiple
                value={selectedTags}
                onChange={(e) => setSelectedTags(e.target.value)}
                input={<OutlinedInput label="Tags" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value} size="small" />
                    ))}
                  </Box>
                )}
                MenuProps={{
                  PaperProps: {
                    style: {
                      maxHeight: 48 * 4.5 + 8,
                      width: 250
                    }
                  }
                }}
              >
                {availableTags.map((tag) => (
                  <MenuItem
                    key={tag}
                    value={tag}
                    style={{
                      fontWeight:
                        selectedTags.indexOf(tag) === -1
                          ? 'normal'
                          : 'bold'
                    }}
                  >
                    {tag}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={selectedConnection ? 3 : 4}>
            <FormControl fullWidth size="small">
              <InputLabel>Serveur</InputLabel>
              <Select
                value={selectedConnection}
                onChange={(e) => {
                  setSelectedConnection(e.target.value);
                  setSelectedDatabase('');
                  if (e.target.value) {
                    loadDatabases(e.target.value);
                  }
                }}
                label="Serveur"
              >
                <MenuItem value="">Tous les serveurs</MenuItem>
                {connections.map((conn) => (
                  <MenuItem key={conn.id} value={conn.id}>
                    {conn.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {selectedConnection && (
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Base de données</InputLabel>
                <Select
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                  label="Base de données"
                >
                  <MenuItem value="">Toutes les bases</MenuItem>
                  {availableDatabases.map((db) => (
                    <MenuItem key={db} value={db}>
                      {db}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* Liste des notes */}
      <Box>
        {loading ? (
          <Typography>Chargement...</Typography>
        ) : notes.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <NoteIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Aucune note trouvée
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Créez votre première note pour commencer
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={4}>
            {notes.map(note => (
              <Grid item xs={12} md={6} lg={4} key={note.id}>
                {renderNoteCard(note)}
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Dialogue d'édition */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingNote ? 'Modifier la note' : 'Nouvelle note'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Titre"
                value={formData.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Tags (séparés par des virgules)"
                value={formData.tags}
                onChange={(e) => handleFormChange('tags', e.target.value)}
                placeholder="sql, export, urgent, bug..."
              />
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ mb: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="h6">Contenus</Typography>
                  <Button
                    startIcon={<AddIcon />}
                    onClick={addContent}
                    variant="outlined"
                    size="small"
                  >
                    Ajouter un contenu
                  </Button>
                </Box>
                
                {formData.contents.map((content, index) => (
                  <Box key={content.id} sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Contenu {index + 1}
                      </Typography>
                      {formData.contents.length > 1 && (
                        <IconButton
                          size="small"
                          onClick={() => removeContent(content.id)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Box>
                    <TextField
                      fullWidth
                      placeholder="SQL, code, notes..."
                      value={content.content}
                      onChange={(e) => updateContent(content.id, e.target.value)}
                      multiline
                      rows={6}
                      required={index === 0}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <CodeIcon />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>
                ))}
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Serveur associé (optionnel)</InputLabel>
                <Select
                  value={formData.connection_id}
                  onChange={(e) => handleFormChange('connection_id', e.target.value)}
                  label="Serveur associé (optionnel)"
                >
                  <MenuItem value="">Aucun serveur</MenuItem>
                  {connections.map((conn) => (
                    <MenuItem key={conn.id} value={conn.id}>
                      {conn.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {formData.connection_id && (
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Base de données (optionnel)</InputLabel>
                  <Select
                    value={formData.database_name}
                    onChange={(e) => handleFormChange('database_name', e.target.value)}
                    label="Base de données (optionnel)"
                  >
                    <MenuItem value="">Aucune base de données</MenuItem>
                    {availableDatabases.map((db) => (
                      <MenuItem key={db} value={db}>
                        {db}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} startIcon={<CancelIcon />}>
            Annuler
          </Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            startIcon={<SaveIcon />}
            disabled={!formData.title.trim() || !formData.contents[0].content.trim()}
          >
            {editingNote ? 'Modifier' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notifications */}
      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError('')}>
        <Alert onClose={() => setError('')} severity="error">
          {error}
        </Alert>
      </Snackbar>
      
      <Snackbar open={!!success} autoHideDuration={4000} onClose={() => setSuccess('')}>
        <Alert onClose={() => setSuccess('')} severity="success">
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Notes;