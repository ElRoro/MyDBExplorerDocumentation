import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Chip,
  Alert,
  LinearProgress,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Paper,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Comment as CommentIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { commentsAPI, connectionsAPI } from '../services/api';

const CommentForm = ({ open, onClose, onSave, initialData, connections }) => {
  const [form, setForm] = useState({
    connection_id: '',
    database_name: '',
    object_type: '',
    object_name: '',
    schema_name: '',
    comment: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialData) {
      setForm(initialData);
    } else {
      setForm({
        connection_id: '',
        database_name: '',
        object_type: '',
        object_name: '',
        schema_name: '',
        comment: '',
      });
    }
  }, [initialData]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (initialData && initialData.id) {
        await commentsAPI.update(initialData.id, { comment: form.comment });
      } else {
        await commentsAPI.create(form);
      }
      onSave();
      onClose();
    } catch (err) {
      // Gérer l'erreur si besoin
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initialData ? 'Modifier le commentaire' : 'Ajouter un commentaire'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {!initialData && (
            <>
              <Grid item xs={12}>
                <FormControl fullWidth required>
                  <InputLabel>Connexion</InputLabel>
                  <Select
                    value={form.connection_id}
                    onChange={handleChange('connection_id')}
                    label="Connexion"
                  >
                    {connections.map((conn) => (
                      <MenuItem key={conn.id} value={conn.id}>
                        {conn.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Base de données"
                  value={form.database_name}
                  onChange={handleChange('database_name')}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Type d'objet"
                  value={form.object_type}
                  onChange={handleChange('object_type')}
                  required
                  placeholder="TABLE, VIEW, PROCEDURE, FUNCTION..."
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Nom de l'objet"
                  value={form.object_name}
                  onChange={handleChange('object_name')}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Schéma (optionnel)"
                  value={form.schema_name}
                  onChange={handleChange('schema_name')}
                />
              </Grid>
            </>
          )}
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Commentaire"
              value={form.comment}
              onChange={handleChange('comment')}
              required
              multiline
              rows={4}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !form.comment || (!initialData && (!form.connection_id || !form.database_name || !form.object_type || !form.object_name))}
        >
          {loading ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const CommentCard = ({ comment, onEdit, onDelete }) => (
  <Card sx={{ mb: 2 }}>
    <CardContent>
      <Box display="flex" alignItems="center" mb={1}>
        <CommentIcon sx={{ mr: 1 }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{comment.object_name}</Typography>
        <Chip label={comment.object_type} size="small" sx={{ ml: 1 }} />
        <Chip label={comment.database_name} size="small" sx={{ ml: 1 }} />
        {comment.schema_name && <Chip label={comment.schema_name} size="small" sx={{ ml: 1 }} />}
      </Box>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Connexion : {comment.connection_name} ({comment.connection_type})
      </Typography>
      <Typography variant="body1" sx={{ mt: 1 }}>{comment.comment}</Typography>
    </CardContent>
    <CardActions>
      <Button size="small" startIcon={<EditIcon />} onClick={() => onEdit(comment)}>
        Modifier
      </Button>
      <IconButton size="small" color="error" onClick={() => onDelete(comment.id)}>
        <DeleteIcon />
      </IconButton>
    </CardActions>
  </Card>
);

const Comments = () => {
  const [comments, setComments] = useState([]);
  const [filteredComments, setFilteredComments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingComment, setEditingComment] = useState(null);
  const [connections, setConnections] = useState([]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const response = await commentsAPI.getAll();
      setComments(response.data);
      setFilteredComments(response.data);
    } catch (err) {
      setError('Erreur lors du chargement des commentaires');
    } finally {
      setLoading(false);
    }
  };

  const fetchConnections = async () => {
    try {
      const response = await connectionsAPI.getAll();
      setConnections(response.data);
    } catch (err) {
      // Gérer l'erreur si besoin
    }
  };

  useEffect(() => {
    fetchComments();
    fetchConnections();
  }, []);

  // Fonction de filtrage des commentaires
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredComments(comments);
    } else {
      const filtered = comments.filter(comment => {
        const searchLower = searchTerm.toLowerCase();
        return (
          comment.object_name?.toLowerCase().includes(searchLower) ||
          comment.object_type?.toLowerCase().includes(searchLower) ||
          comment.database_name?.toLowerCase().includes(searchLower) ||
          comment.schema_name?.toLowerCase().includes(searchLower) ||
          comment.comment?.toLowerCase().includes(searchLower) ||
          comment.connection_name?.toLowerCase().includes(searchLower) ||
          comment.connection_type?.toLowerCase().includes(searchLower)
        );
      });
      setFilteredComments(filtered);
    }
  }, [searchTerm, comments]);

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleAdd = () => {
    setEditingComment(null);
    setDialogOpen(true);
  };

  const handleEdit = (comment) => {
    setEditingComment(comment);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce commentaire ?')) {
      try {
        await commentsAPI.delete(id);
        fetchComments();
      } catch (err) {
        setError('Erreur lors de la suppression');
      }
    }
  };

  const handleSave = () => {
    fetchComments();
  };

  if (loading) {
    return <LinearProgress />;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1}>
          <CommentIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h5" component="h1">
            Commentaires
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          Ajouter un commentaire
        </Button>
      </Box>

      {/* Filtre de recherche */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          label="Rechercher dans les commentaires"
          value={searchTerm}
          onChange={handleSearchChange}
          placeholder="Rechercher par nom d'objet, type, base de données, commentaire..."
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          variant="outlined"
        />
        {searchTerm && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            {filteredComments.length} commentaire(s) trouvé(s) sur {comments.length}
          </Typography>
        )}
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {filteredComments.length === 0 && !loading && (
        <Box textAlign="center" py={4}>
          <Typography variant="h6" color="textSecondary">
            {searchTerm ? 'Aucun commentaire trouvé' : 'Aucun commentaire pour le moment'}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {searchTerm 
              ? 'Essayez de modifier vos critères de recherche'
              : 'Ajoutez un commentaire sur un objet de base de données'
            }
          </Typography>
        </Box>
      )}

      {filteredComments.map((comment) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ))}

      <CommentForm
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingComment}
        connections={connections}
      />
    </Box>
  );
};

export default Comments; 