import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

export const api = axios.create({ baseURL: API_BASE });

// Auth
export async function login(email: string, password: string) {
  const { data } = await api.post('/auth/login', { email, password });
  api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
  return data;
}
export async function register(email: string, name: string, password: string) {
  const { data } = await api.post('/auth/register', { email, name, password });
  return data;
}

// Orders
export const Orders = {
  list: async () => (await api.get('/orders')).data,
  get: async (id: string) => (await api.get(`/orders/${id}`)).data,
  create: async (payload: any) => (await api.post('/orders', payload)).data,
  setStatus: async (id: string, status: string) => (await api.patch(`/orders/${id}/status`, { status })).data,
};

// Bids
export const Bids = {
  list: async (orderId?: string) => (await api.get('/bids', { params: { orderId } })).data,
  create: async (payload: any) => (await api.post('/bids', payload)).data,
  update: async (id: string, payload: any) => (await api.patch(`/bids/${id}`, payload)).data,
};

// Wallets
export const Wallets = {
  get: async (user_id: string) => (await api.get(`/wallets/${user_id}`)).data,
  update: async (user_id: string, payload: any) => (await api.patch(`/wallets/${user_id}`, payload)).data,
};

// Messages
export const Messages = {
  list: async () => (await api.get('/messages')).data,
  create: async (payload: any) => (await api.post('/messages', payload)).data,
};

// Reviews
export const Reviews = {
  list: async () => (await api.get('/reviews')).data,
  create: async (payload: any) => (await api.post('/reviews', payload)).data,
};
