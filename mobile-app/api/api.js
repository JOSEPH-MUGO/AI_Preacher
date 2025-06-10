import axios from 'axios';

const API_BASE = 'http://10.0.2.170:5000/api';

export const getDenominations = () => axios.get(`${API_BASE}/denominations`);

export const loginUser = (data) => axios.post(`${API_BASE}/users/login`, data);

export const registerUser = (data) => axios.post(`${API_BASE}/users`, data);

export const updateMood = (userId, mood) =>
  axios.put(`${API_BASE}/users/${userId}/mood`, { mood });

export const sendChatMessage = (userId, message) =>
  axios.post(`${API_BASE}/chat`, { userId, message });

export const getChatHistory = (userId) =>
  axios.get(`${API_BASE}/history/${userId}`);
