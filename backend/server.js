require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");

const RoomManager = require("./services/RoomManager");
const registerSocketHandlers = require("./socket/socketHandlers");

const app = express();
const server = http.createServer(app);

// Allow local development and production URLs seamlessly
const allowedOrigins = [
    process.env.CLIENT_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost:4173"
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow mobile/curl/SSR requests without origin or allowed origins
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".onrender.com") || origin.endsWith(".vercel.app")) {
            return callback(null, true);
        }
        return callback(null, true); // Permissive for watch party demo
    },
    methods: ["GET", "POST"],
    credentials: true
};

const io = new Server(server, {
    cors: corsOptions
});

app.use(cors(corsOptions));
app.use(express.json());

const roomManager = new RoomManager();

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        activeRooms: roomManager.rooms.size,
        message: "YouTube Watch Party backend is running"
    });
});

// Endpoint to verify room validity before connecting
app.get("/api/rooms/:roomId", (req, res) => {
    const room = roomManager.getRoom(req.params.roomId);
    if (!room) {
        return res.status(404).json({ exists: false, message: "Room not found" });
    }
    res.json({
        exists: true,
        roomId: room.roomId,
        participantCount: room.participants.size,
        currentVideoId: room.currentVideoId
    });
});

registerSocketHandlers(io, roomManager);

const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        `[Server] YouTube Watch Party backend running on port ${PORT}`
    );
});