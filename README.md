# YouTube Watch Party

A real-time YouTube Watch Party application that allows multiple users to watch YouTube videos together in synchronized rooms.

Users can create or join rooms, watch the same YouTube video, synchronize playback actions in real time, manage roles, request moderator access, remove participants, and communicate through chat.

## Features

- Create a watch party room with a unique room code
- Join an existing room using a room code
- Host and Participant roles
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
- react-youtube

### Backend
- Node.js
- Express
- Socket.IO

### Real-Time Communication
Socket.IO is used for bidirectional real-time communication between the frontend and backend.

### Video
YouTube IFrame Player API through `react-youtube`.

## Project Structure

```text
youtube-watch-party/
│
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── roomManager.js
│   └── socket/
│       └── socketHandlers.js
│
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       ├── pages/
│       │   ├── Home.jsx
│       │   └── Room.jsx
│       └── services/
│           └── socket.js
│
└── README.md