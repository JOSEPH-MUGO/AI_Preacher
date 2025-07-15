// mobile-app/api/api.js
import axios from 'axios';
import { Platform } from 'react-native';


let API_BASE = 'http://10.0.5.208:5000/api'; 
if (Platform.OS === 'web') {
  API_BASE = 'http://localhost:5000/api'; 
}


export const getDenominations = () => axios.get(`${API_BASE}/denominations`);
export const loginUser = (data) => axios.post(`${API_BASE}/users/login`, data);
export const registerUser = (data) => axios.post(`${API_BASE}/users`, data);
export const updateMood = (userId, mood) =>
  axios.put(`${API_BASE}/users/${userId}/mood`, { mood });


export const createChatSession = (userId) => 
  axios.post(`${API_BASE}/chat_sessions`, { userId });

export const getChatSessions = (userId) =>
  axios.get(`${API_BASE}/chat_sessions`, { params: { userId } });


export const sendChatMessage = (userId, sessionId, message) =>
  axios.post(`${API_BASE}/chat`, { userId, sessionId, message });


export const getChatHistory = (userId, sessionId) =>
  axios.get(`${API_BASE}/history`, { params: { userId, sessionId } });

export default {
  getDenominations,
  loginUser,
  registerUser,
  updateMood,
  createChatSession,
  getChatSessions,
  sendChatMessage,
  getChatHistory,
};
