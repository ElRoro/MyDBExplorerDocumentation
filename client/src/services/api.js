import axios from 'axios';

// Configuration de l'URL de base selon l'environnement
const getBaseURL = () => {
  if (process.env.NODE_ENV === 'production') {
    // En production, utiliser le chemin relatif pour l'API
    return '/api';
  }
  // En développement, utiliser l'URL locale
  return process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
};

const API_BASE_URL = getBaseURL();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 2 minutes de timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur pour gérer les erreurs
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Ne loguer que les vraies erreurs (hors 404)
    if (!(error.response && error.response.status === 404)) {
      console.error('Erreur API:', error);
    }
    if (error.code === 'ECONNABORTED') {
      error.message = 'La requête a pris trop de temps à répondre. Veuillez réessayer.';
    }
    return Promise.reject(error);
  }
);

// Service des connexions
export const connectionsAPI = {
  getAll: () => api.get('/connections'),
  getActiveConnections: () => api.get('/connections/active'),
  getById: (id) => api.get(`/connections/${id}`),
  create: (data) => api.post('/connections', data),
  update: (id, data) => api.put(`/connections/${id}`, data),
  delete: (id) => api.delete(`/connections/${id}`),
  toggle: (id) => api.patch(`/connections/${id}/toggle`),
  test: (id) => api.post(`/connections/${id}/test`),
  getDatabases: (id) => api.get(`/connections/${id}/databases`),
};

// Service de recherche
export const searchAPI = {
  search: (data) => api.post('/search', data),
  searchAdvanced: (data) => api.post('/search/advanced', data),
  getRecent: () => api.get('/search/recent'),
  getDDL: (connectionId, databaseName, objectType, objectName, schemaName) =>
    api.get(`/search/ddl/${connectionId}/${databaseName}/${objectType}/${objectName}`, {
      params: { schema_name: schemaName },
    }),
  getDependencies: (connectionId, databaseName, objectType, objectName, schemaName) =>
    api.get(`/search/dependencies/${connectionId}/${databaseName}/${objectType}/${objectName}`, {
      params: { schema_name: schemaName },
    }),
  getTableData: (connectionId, databaseName, tableName, schemaName, limit = 200) =>
    api.get(`/search/data/${connectionId}/${databaseName}/${tableName}`, {
      params: { schema_name: schemaName, limit },
    }),
};

// Service des commentaires
export const commentsAPI = {
  getAll: () => api.get('/comments'),
  getByObject: (connectionId, databaseName, objectType, objectName, schemaName = null) => 
    api.get(`/comments/object/${connectionId}/${databaseName}/${objectType}/${objectName}`, {
      params: { schema_name: schemaName }
    }),
  create: (data) => api.post('/comments', data),
  update: (id, data) => api.put(`/comments/${id}`, data),
  delete: (id) => api.delete(`/comments/${id}`),
  search: (term) => api.get(`/comments/search/${term}`),
  getStats: () => api.get('/comments/stats/overview')
};

// Service des bases de données
export const databasesAPI = {
  getAll: () => api.get('/databases'),
  getByConnection: (connectionId) => api.get(`/databases/connection/${connectionId}`),
  getStats: () => api.get('/databases/stats'),
};

// Service des notes
export const notesAPI = {
  getAll: () => api.get('/notes'),
  getById: (id) => api.get(`/notes/${id}`),
  create: (data) => api.post('/notes', data),
  update: (id, data) => api.put(`/notes/${id}`, data),
  deleteNote: (id) => api.delete(`/notes/${id}`),
  search: (params) => api.get('/notes', { params }),
};

// Service des paramètres
export const settingsAPI = {
  getSettings: () => api.get('/settings'),
  updateSettings: (data) => api.put('/settings', data),
};

export const jobsAPI = {
  getAll: () => api.get('/jobs'),
  getStatus: (connectionId, jobId) => api.get(`/jobs/${connectionId}/${jobId}/status`),
  getCurrentStep: (connectionId, jobId) => api.get(`/jobs/${connectionId}/${jobId}/current-step`),
  getSteps: (connectionId, jobId) => api.get(`/jobs/${connectionId}/${jobId}/steps`),
  getStepDetails: (connectionId, jobId, stepId) => api.get(`/jobs/${connectionId}/${jobId}/steps/${stepId}/details`),
  getCatalogLogs: (connectionId, jobId, stepId, executionId = null, executionTime = null, loadMore = false) => api.get(`/jobs/${connectionId}/${jobId}/steps/${stepId}/catalog-logs`, { params: { executionId, executionTime, loadMore } }),
  getJobLogs: (connectionId, jobId, stepId, executionTime = null, loadMore = false) => api.get(`/jobs/${connectionId}/${jobId}/steps/${stepId}/job-logs`, { params: { executionTime, loadMore } }),
  updateStepCommand: (connectionId, jobId, stepId, command) => api.put(`/jobs/${connectionId}/${jobId}/steps/${stepId}/command`, { command }),
  startJob: (connectionId, jobId, stepId = null) => api.post(`/jobs/${connectionId}/${jobId}/start`, { stepId }),
  stopJob: (connectionId, jobId) => api.post(`/jobs/${connectionId}/${jobId}/stop`),
  toggleJob: (connectionId, jobId, enabled) => api.post(`/jobs/${connectionId}/${jobId}/toggle`, { enabled })
};

// Service des requêtes multi-bases
export const multiQueryAPI = {
  execute: (data) => api.post('/multi-query/execute', data),
  validate: (query) => api.post('/multi-query/validate', { query }),
  getHistory: () => api.get('/multi-query/history'),
};

export default api; 