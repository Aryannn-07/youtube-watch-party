const crypto = require("crypto");
const Room = require("../models/Room");

class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    generateRoomId() {
        let roomId;
        do {
            roomId = crypto.randomBytes(3).toString("hex").toUpperCase();
        } while (this.rooms.has(roomId));
        return roomId;
    }

    createRoom(hostId, username, defaultVideoId = "dQw4w9WgXcQ") {
        const roomId = this.generateRoomId();
        const room = new Room(roomId, hostId, username, defaultVideoId);
        this.rooms.set(roomId, room);
        return room;
    }

    getRoom(roomId) {
        if (!roomId) return null;
        const normalized = roomId.trim().toUpperCase();
        return this.rooms.get(normalized) || null;
    }

    addParticipant(roomId, userId, username, role = "PARTICIPANT") {
        const room = this.getRoom(roomId);
        if (!room) return null;
        return room.addParticipant(userId, username, role);
    }

    restoreParticipant(roomId, userId) {
        const room = this.getRoom(roomId);
        if (!room) return null;
        return room.getParticipant(userId);
    }

    removeParticipant(roomId, userId) {
        const room = this.getRoom(roomId);
        if (!room) return null;
        room.removeParticipant(userId);
        return room;
    }

    getParticipant(roomId, userId) {
        const room = this.getRoom(roomId);
        if (!room) return null;
        return room.getParticipant(userId);
    }

    getParticipants(roomId) {
        const room = this.getRoom(roomId);
        if (!room) return [];
        return room.getParticipants();
    }

    assignRole(roomId, userId, role) {
        const room = this.getRoom(roomId);
        if (!room) return null;
        return room.assignRole(userId, role);
    }

    transferHost(roomId, newHostId) {
        const room = this.getRoom(roomId);
        if (!room) return false;
        return room.transferHost(newHostId);
    }

    deleteRoomIfEmpty(roomId) {
        const room = this.getRoom(roomId);
        if (room && room.isEmpty()) {
            this.rooms.delete(roomId);
            return true;
        }
        return false;
    }
}

module.exports = RoomManager;