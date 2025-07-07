import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur pour gérer les erreurs
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Erreur API:', error);
    return Promise.reject(error);
  }
);

// Service des connexions
export const connectionsAPI = {
  getAll: () => api.get('/connections'),
  getActive: () => api.get('/connections/active'),
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
  getByObject: (connectionId, databaseName, objectType, objectName, schemaName) =>
    api.get(`/comments/object/${connectionId}/${databaseName}/${objectType}/${objectName}`, {
      params: { schema_name: schemaName },
    }),
  getByConnection: (connectionId) => api.get(`/comments/connection/${connectionId}`),
  create: (data) => api.post('/comments', data),
  update: (id, data) => api.put(`/comments/${id}`, data),
  delete: (id) => api.delete(`/comments/${id}`),
  search: (term) => api.get(`/comments/search/${term}`),
  getStats: () => api.get('/comments/stats/overview'),
};

// Service des bases de données
export const databasesAPI = {
  getAll: () => api.get('/databases'),
  getByConnection: (connectionId) => api.get(`/databases/connection/${connectionId}`),
  getStats: () => api.get('/databases/stats'),
};

export default api; 