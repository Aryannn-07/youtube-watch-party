const Participant = require("./Participant");

class Room {
    constructor(roomId, hostId, hostUsername, defaultVideoId = "dQw4w9WgXcQ") {
        this.roomId = roomId;
        this.hostId = hostId;
        this.currentVideoId = defaultVideoId;
        this.currentTime = 0;
        this.playState = "PAUSED"; // "PLAYING" | "PAUSED"
        this.lastUpdatedTimestamp = Date.now();
        this.createdAt = Date.now();

        this.participants = new Map();
        this.messages = [];
        this.pendingModeratorRequests = new Map();

        // Add creator as HOST
        const hostParticipant = new Participant({
            userId: hostId,
            username: hostUsername,
            role: "HOST"
        });
        this.participants.set(hostId, hostParticipant);
    }

    addParticipant(userId, username, role = "PARTICIPANT") {
        let participant = this.participants.get(userId);
        if (participant) {
            participant.username = username;
            return participant;
        }

        participant = new Participant({
            userId,
            username,
            role
        });
        this.participants.set(userId, participant);
        return participant;
    }

    getParticipant(userId) {
        return this.participants.get(userId) || null;
    }

    removeParticipant(userId) {
        this.pendingModeratorRequests.delete(userId);
        return this.participants.delete(userId);
    }

    getParticipants() {
        return Array.from(this.participants.values()).map((p) => p.toJSON());
    }

    assignRole(userId, newRole) {
        const participant = this.participants.get(userId);
        if (!participant) return null;
        if (participant.role === "HOST") return null;

        const success = participant.setRole(newRole);
        if (success) {
            this.pendingModeratorRequests.delete(userId);
            return participant;
        }
        return null;
    }

    transferHost(newHostId) {
        const currentHost = this.participants.get(this.hostId);
        const targetParticipant = this.participants.get(newHostId);

        if (!targetParticipant) return false;

        if (currentHost) {
            currentHost.role = "MODERATOR";
        }
        targetParticipant.role = "HOST";
        this.hostId = newHostId;
        return true;
    }

    updatePlayback({ playState, currentTime }) {
        if (typeof currentTime === "number" && !isNaN(currentTime)) {
            this.currentTime = Math.max(0, currentTime);
        }
        if (playState && ["PLAYING", "PAUSED"].includes(playState)) {
            this.playState = playState;
        }
        this.lastUpdatedTimestamp = Date.now();
    }

    getCalculatedCurrentTime() {
        if (this.playState === "PLAYING") {
            const elapsed = (Date.now() - this.lastUpdatedTimestamp) / 1000;
            return this.currentTime + elapsed;
        }
        return this.currentTime;
    }

    getSyncState() {
        return {
            playState: this.playState,
            currentTime: this.getCalculatedCurrentTime(),
            videoId: this.currentVideoId
        };
    }

    changeVideo(videoId) {
        this.currentVideoId = videoId;
        this.currentTime = 0;
        this.playState = "PAUSED";
        this.lastUpdatedTimestamp = Date.now();
        return this.getSyncState();
    }

    addChatMessage(senderId, senderName, text, role) {
        const message = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            roomId: this.roomId,
            senderId,
            senderName,
            text: text.trim(),
            role: role || "PARTICIPANT",
            timestamp: Date.now()
        };

        this.messages.push(message);
        if (this.messages.length > 200) {
            this.messages.shift();
        }
        return message;
    }

    getRecentMessages() {
        return this.messages;
    }

    requestModerator(userId, username) {
        const request = {
            userId,
            username,
            requestedAt: Date.now()
        };
        this.pendingModeratorRequests.set(userId, request);
        return request;
    }

    dismissModeratorRequest(userId) {
        return this.pendingModeratorRequests.delete(userId);
    }

    getPendingModeratorRequests() {
        return Array.from(this.pendingModeratorRequests.values());
    }

    isEmpty() {
        return this.participants.size === 0;
    }
}

module.exports = Room;
