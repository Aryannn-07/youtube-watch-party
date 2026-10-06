class Participant {
    constructor({ userId, username, role = "PARTICIPANT", socketId = null }) {
        this.userId = userId;
        this.username = username;
        this.role = role.toUpperCase();
        this.socketId = socketId;
        this.joinedAt = Date.now();
    }

    setRole(newRole) {
        const normalized = newRole.toUpperCase();
        if (["HOST", "MODERATOR", "PARTICIPANT", "VIEWER"].includes(normalized)) {
            this.role = normalized;
            return true;
        }
        return false;
    }

    hasControlPermission() {
        return this.role === "HOST" || this.role === "MODERATOR";
    }

    isHost() {
        return this.role === "HOST";
    }

    toJSON() {
        return {
            userId: this.userId,
            username: this.username,
            role: this.role,
            joinedAt: this.joinedAt
        };
    }
}

module.exports = Participant;
