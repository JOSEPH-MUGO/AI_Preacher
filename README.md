# AI Preacher

A cross-platform mobile & web chat app that delivers personalized, scripture-based encouragement powered by Gemini model AI.
User start by registering there details such as name, email, mood/feeling and selecting denomination.The user start the chat with AI, Prompting the AI with there confessions, questions.
The AI respond in a personalized way accounting the mood and the denomination of the user, give an empathy and encouragement, quote a bible verse, offer an interpretation and close with a prayer.
Giving the user a feeling of having a caring and loving pastor right with them. 
The AI_preacher is Builds on:

- **Node.js / Express** backend  
- **PostgreSQL** for user, denomination & chat history  
- **Google AI (Gemini)** for AI sermon generation  
- **React Native (Expo)** frontend with WhatsApp-style UI
- **VS code** for writing and editing codes 

---


## 🚀 Features

- **User Registration & Login**  
  - Name, email, mood, and denomination  
  - Email‐based login & single‐account updates  
- **Real-time Chat**  
  - Personalized greeting  
  - AI responses with empathy, Bible verses, interpretation & prayer  
  - Typing indicator  
- **Chat History Sidebar**  
  - Slide-out panel grouped by date (Today/Yesterday/Older)  
  - Tap to reload a past day’s conversation  
- **WhatsApp-style UI**  
  - Custom chat bubbles & background  
  - Input bar always above keyboard & nav bar  
  - Safe area handling for notches & soft buttons  
- **Backend Persistence**  
  - Stores user profiles, moods, denominations  
  - Logs every user message, AI response & extracted verses  

---

## 🛠 Tech Stack

| Layer      | Technology                     |
| ---------- | ------------------------------ |
| Backend    | Node.js · Express              |
| Database   | PostgreSQL                     |
| AI         | Google Gemini model 2.0 flash API (via HTTP)   |
| Frontend   | React Native · Expo  |
| HTTP Client| Axios                          |
| Navigation | React Navigation (Native Stack) |

---

## 🏗 Architecture


- **Mobile-app/Frontend** calls `/api/users`, `/api/denominations`, `/api/chat`, `/api/history/:userId`
- **Backend** handles user management, mood/denomination updates, chat history, calls Gemini, saves to DB
- **DataBase** stores the user data

---

## 🏁 Getting Started

### Prerequisites

- Node.js
- PostgreSQL
- Expo CLI (`npm install -g expo-cli`)
- Google Gemini API key (gemini 2.0 flash >>> which is free)

### Backend Setup

1. **Clone & install**  
   ```bash
   git clone https://github.com/JOSEPH-MUGO/ai_preacher.git
   cd ai_preacher/Backend
   npm install
   
---
### Initialize psql database
```bash
CREATE DATABASE ai_preacher;
/c ai_preacher;
CREATE TABLE denominations (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT INTO denominations (name) VALUES
  ('Catholic'), ('Protestant'), ('Orthodox'), ('Evangelical');
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mood TEXT,
  denomination_id INTEGER REFERENCES denominations(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chat_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  user_message TEXT,
  ai_response TEXT,
  bible_verses TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```
---
### Create a .env file and configure
```bash
PORT=5000
GEMINI_API_KEY=YOUR API KEY
DATABASE_URL=postgres://yourusername:yourpassword@localhost:5432/ai_preacher
```
---
### Run server
```bash
node index.js
```
---

### Frontend/mobile-app (Expo) Setup
- Go to Google playstore in your android phone Camera app in ios, download "Expo Go" app.
- In a separate terminal run the following commands one at a time.
```bash
cd ai_preacher/mobile-app
npm install
npx expo start
```
### EDIT api/api.js
- Set `API_BASE` to your local IP:
  ```bash
  This line
  export const API_BASE = 'http://your-local ip:5000/api';
  ```
 -**note** your local ip is give in this line
 ```bash
> Metro waiting on exp+mobile-app://expo-development-client/?url=http://**10.0.2.170**:8081
  ```
---
### Launch on Expo Go on device (scan QR code) 
- scan the QR code below the *Starting Metro Bundler*
  
**OR**
### Launch on the web.
- › Web is waiting on http://localhost:*8081*
  ---
🎉🎉***Congratulations enjoy the ai_preacher mobile app and web app***








