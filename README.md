# YouTube Watch Party

A real-time YouTube Watch Party application that allows multiple users to watch YouTube videos together in synchronized rooms.

Users can create or join rooms, watch the same YouTube video, synchronize playback actions in real time, manage roles, request moderator access, remove participants, and communicate through chat.

## Features

- Create a watch party room with a unique room code
- Join an existing room using a room code
- Host, Moderator, and Participant roles
- Promote Participants to Moderator
- Participant request for Moderator access
- Remove participants from a room
- Real-time Play synchronization
- Real-time Pause synchronization
- Real-time Seek synchronization
- Real-time Change Video synchronization
- Reconnection and room restoration
- Participant list with roles
- Real-time chat
- Backend permission validation
- Embedded YouTube player

## Tech Stack

### Frontend
- React
- Vite
- React Router
- Socket.IO Client
- React YouTube

### Backend
- Node.js
- Express
- Socket.IO

### Deployment
- Vercel
- Render

## Architecture

```text
React Frontend
      |
      | Socket.IO
      v
Node.js + Express + Socket.IO
      |
      v
RoomManager
      |
      +-- Rooms
      +-- Participants
      +-- Roles
      +-- Video State

## Project Structure

youtube-watch-party/
│
├── backend/
│   ├── models/
│   │   ├── Participant.js
│   │   └── Room.js
│   │
│   ├── services/
│   │   └── RoomManager.js
│   │
│   ├── socket/
│   │   └── socketHandlers.js
│   │
│   ├── server.js
│   ├── test-e2e.js
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   └── Room.jsx
│   │   │
│   │   ├── services/
│   │   │   └── socket.js
│   │   │
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── index.css
│   │
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
│
├── README.md
└── .gitignore


## Roles
Host
The user who creates the room.
Permissions:
- Play
- Pause
- Seek
- Change Video
- Assign Moderator
- Approve Moderator requests
- Remove participants
Moderator
A participant promoted by the Host.
Permissions:
- Play
- Pause
- Seek
- Change Video
Participant
The default role for users joining a room.
Can:
- Watch the synchronized video
- Use chat
- Request Moderator access

## Local Setup

### Backend

```bash
cd backend
npm install
npm run dev

## Live Demo

**Frontend:**  
https://youtube-watch-party-azure.vercel.app

**Backend:**  
https://youtube-watch-party-yfqg.onrender.com

**Health Check:**  
https://youtube-watch-party-yfqg.onrender.com/api/health

**Repository**
https://github.com/Aryannn-07/youtube-watch-party