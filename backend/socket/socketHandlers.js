function registerSocketHandlers(io, roomManager) {
    io.on("connection", (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);

        // Helper to get current room and participant
        const getSessionContext = () => {
            const roomId = socket.data.roomId;
            const userId = socket.data.userId;
            if (!roomId || !userId) return { room: null, participant: null };

            const room = roomManager.getRoom(roomId);
            if (!room) return { room: null, participant: null };

            const participant = room.getParticipant(userId);
            return { room, participant, roomId, userId };
        };

        // ==========================================
        // CREATE ROOM
        // ==========================================
        socket.on("create_room", ({ username, userId, defaultVideoId }, callback) => {
            if (!username || !username.trim()) {
                return callback?.({
                    success: false,
                    message: "Username is required"
                });
            }

            if (!userId) {
                return callback?.({
                    success: false,
                    message: "User ID is required"
                });
            }

            const cleanUsername = username.trim();
            const room = roomManager.createRoom(
                userId,
                cleanUsername,
                defaultVideoId || "dQw4w9WgXcQ"
            );

            socket.data.userId = userId;
            socket.data.roomId = room.roomId;
            socket.join(room.roomId);

            const syncState = room.getSyncState();
            const participants = room.getParticipants();

            callback?.({
                success: true,
                roomId: room.roomId,
                userId,
                username: cleanUsername,
                role: "HOST",
                participants,
                syncState,
                messages: room.getRecentMessages()
            });

            console.log(`[Room] Created: ${room.roomId} by ${cleanUsername} (${userId})`);
        });

        // ==========================================
        // JOIN ROOM
        // ==========================================
        socket.on("join_room", ({ roomId, username, userId }, callback) => {
            if (!roomId || !username || !username.trim()) {
                return callback?.({
                    success: false,
                    message: "Room code and username are required"
                });
            }

            if (!userId) {
                return callback?.({
                    success: false,
                    message: "User ID is required"
                });
            }

            const normalizedRoomId = roomId.trim().toUpperCase();
            const room = roomManager.getRoom(normalizedRoomId);

            if (!room) {
                return callback?.({
                    success: false,
                    message: `Room "${normalizedRoomId}" not found. Please verify the room code.`
                });
            }

            const cleanUsername = username.trim();
            // Default role is PARTICIPANT; if rejoining as creator, keep HOST
            const isCreator = room.hostId === userId;
            const assignedRole = isCreator ? "HOST" : "PARTICIPANT";

            const participant = room.addParticipant(userId, cleanUsername, assignedRole);

            socket.data.userId = userId;
            socket.data.roomId = normalizedRoomId;
            socket.join(normalizedRoomId);

            const participants = room.getParticipants();
            const syncState = room.getSyncState();

            callback?.({
                success: true,
                roomId: normalizedRoomId,
                userId,
                username: cleanUsername,
                role: participant.role,
                participants,
                syncState,
                messages: room.getRecentMessages(),
                pendingRequests: room.getPendingModeratorRequests()
            });

            // Broadcast to other participants
            socket.to(normalizedRoomId).emit("user_joined", {
                username: cleanUsername,
                userId,
                role: participant.role,
                participants
            });

            // Send sync_state directly to this client
            socket.emit("sync_state", syncState);

            console.log(`[Room] ${cleanUsername} joined room ${normalizedRoomId} as ${participant.role}`);
        });

        // ==========================================
        // RESTORE ROOM (page refresh / reconnect)
        // ==========================================
        socket.on("restore_room", ({ roomId, userId }, callback) => {
            if (!roomId || !userId) {
                return callback?.({
                    success: false,
                    message: "Room ID and user ID are required"
                });
            }

            const normalizedRoomId = roomId.trim().toUpperCase();
            const room = roomManager.getRoom(normalizedRoomId);

            if (!room) {
                return callback?.({
                    success: false,
                    message: "Room not found or expired"
                });
            }

            const participant = room.getParticipant(userId);
            if (!participant) {
                return callback?.({
                    success: false,
                    message: "Participant session not found in room"
                });
            }

            socket.data.userId = userId;
            socket.data.roomId = normalizedRoomId;
            socket.join(normalizedRoomId);

            const participants = room.getParticipants();
            const syncState = room.getSyncState();

            callback?.({
                success: true,
                roomId: normalizedRoomId,
                userId,
                username: participant.username,
                role: participant.role,
                participants,
                syncState,
                messages: room.getRecentMessages(),
                pendingRequests: room.getPendingModeratorRequests()
            });

            // Ensure client receives current video state
            socket.emit("sync_state", syncState);

            console.log(`[Room] ${participant.username} restored in ${normalizedRoomId} (${participant.role})`);
        });

        // ==========================================
        // LEAVE ROOM
        // ==========================================
        socket.on("leave_room", ({ roomId }, callback) => {
            const { room, participant, userId } = getSessionContext();
            const targetRoomId = (roomId || socket.data.roomId || "").trim().toUpperCase();

            if (room && targetRoomId === room.roomId) {
                const leavingUsername = participant ? participant.username : "A user";
                room.removeParticipant(userId);
                socket.leave(room.roomId);

                const remainingParticipants = room.getParticipants();

                // If host leaves and there are participants left, auto-elect next moderator or participant
                if (room.hostId === userId && remainingParticipants.length > 0) {
                    const nextHost = remainingParticipants.find((p) => p.role === "MODERATOR") || remainingParticipants[0];
                    if (nextHost) {
                        room.transferHost(nextHost.userId);
                        io.to(room.roomId).emit("host_transferred", {
                            newHostId: nextHost.userId,
                            previousHostId: userId,
                            participants: room.getParticipants()
                        });
                    }
                }

                socket.to(room.roomId).emit("user_left", {
                    userId,
                    username: leavingUsername,
                    participants: room.getParticipants()
                });

                roomManager.deleteRoomIfEmpty(room.roomId);
            }

            socket.data.roomId = null;
            socket.data.userId = null;
            callback?.({ success: true });
        });

        // ==========================================
        // REQUEST SYNC STATE
        // ==========================================
        socket.on("request_sync", (callback) => {
            const { room } = getSessionContext();
            if (!room) return;

            const syncState = room.getSyncState();
            socket.emit("sync_state", syncState);
            callback?.({ success: true, syncState });
        });

        // ==========================================
        // PLAY
        // ==========================================
        socket.on("play", ({ currentTime }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) {
                return callback?.({
                    success: false,
                    message: "User is not in an active room"
                });
            }

            if (!participant.hasControlPermission()) {
                return callback?.({
                    success: false,
                    message: "Permission denied: Only the Host or Moderators can control playback"
                });
            }

            const validTime = typeof currentTime === "number" && !isNaN(currentTime) ? currentTime : room.currentTime;
            room.updatePlayback({ playState: "PLAYING", currentTime: validTime });

            // Broadcast play to everyone in the room except sender (sender already triggered locally)
            socket.to(roomId).emit("play", {
                currentTime: validTime,
                by: participant.username
            });

            // Also broadcast sync_state so clients stay synchronized
            io.to(roomId).emit("sync_state", room.getSyncState());

            callback?.({ success: true });
            console.log(`[Playback] PLAY in ${roomId} at ${validTime}s by ${participant.username}`);
        });

        // ==========================================
        // PAUSE
        // ==========================================
        socket.on("pause", ({ currentTime }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) {
                return callback?.({
                    success: false,
                    message: "User is not in an active room"
                });
            }

            if (!participant.hasControlPermission()) {
                return callback?.({
                    success: false,
                    message: "Permission denied: Only the Host or Moderators can control playback"
                });
            }

            const validTime = typeof currentTime === "number" && !isNaN(currentTime) ? currentTime : room.currentTime;
            room.updatePlayback({ playState: "PAUSED", currentTime: validTime });

            socket.to(roomId).emit("pause", {
                currentTime: validTime,
                by: participant.username
            });

            io.to(roomId).emit("sync_state", room.getSyncState());

            callback?.({ success: true });
            console.log(`[Playback] PAUSE in ${roomId} at ${validTime}s by ${participant.username}`);
        });

        // ==========================================
        // SEEK
        // ==========================================
        socket.on("seek", ({ currentTime, time }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) {
                return callback?.({
                    success: false,
                    message: "User is not in an active room"
                });
            }

            if (!participant.hasControlPermission()) {
                return callback?.({
                    success: false,
                    message: "Permission denied: Only the Host or Moderators can seek"
                });
            }

            const targetTime = typeof time === "number" ? time : currentTime;
            if (typeof targetTime !== "number" || isNaN(targetTime)) {
                return callback?.({ success: false, message: "Valid timestamp required" });
            }

            room.updatePlayback({ currentTime: targetTime });

            socket.to(roomId).emit("seek", {
                currentTime: targetTime,
                by: participant.username
            });

            io.to(roomId).emit("sync_state", room.getSyncState());

            callback?.({ success: true });
            console.log(`[Playback] SEEK in ${roomId} to ${targetTime}s by ${participant.username}`);
        });

        // ==========================================
        // CHANGE VIDEO
        // ==========================================
        socket.on("change_video", ({ videoId }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) {
                return callback?.({
                    success: false,
                    message: "User is not in an active room"
                });
            }

            if (!participant.hasControlPermission()) {
                return callback?.({
                    success: false,
                    message: "Permission denied: Only the Host or Moderators can change the video"
                });
            }

            if (!videoId || !videoId.trim()) {
                return callback?.({
                    success: false,
                    message: "Valid YouTube Video ID is required"
                });
            }

            const cleanVideoId = videoId.trim();
            const newSyncState = room.changeVideo(cleanVideoId);

            // Broadcast change_video and updated sync_state to entire room
            io.to(roomId).emit("change_video", {
                videoId: cleanVideoId,
                by: participant.username
            });
            io.to(roomId).emit("sync_state", newSyncState);

            callback?.({
                success: true,
                videoId: cleanVideoId
            });

            console.log(`[Video] CHANGED in ${roomId} to ${cleanVideoId} by ${participant.username}`);
        });

        // ==========================================
        // ASSIGN ROLE (Host Only)
        // ==========================================
        socket.on("assign_role", ({ userId, role }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) {
                return callback?.({ success: false, message: "User is not in a room" });
            }

            if (participant.role !== "HOST") {
                return callback?.({
                    success: false,
                    message: "Unauthorized: Only the Host can assign roles"
                });
            }

            const validRoles = ["PARTICIPANT", "MODERATOR", "VIEWER"];
            const targetRole = role ? role.toUpperCase() : "";

            if (!validRoles.includes(targetRole)) {
                return callback?.({ success: false, message: "Invalid role specified" });
            }

            const updatedParticipant = room.assignRole(userId, targetRole);
            if (!updatedParticipant) {
                return callback?.({
                    success: false,
                    message: "Failed to update role. Cannot modify host role directly."
                });
            }

            const participants = room.getParticipants();

            io.to(roomId).emit("role_assigned", {
                userId: updatedParticipant.userId,
                username: updatedParticipant.username,
                role: updatedParticipant.role,
                participants
            });

            callback?.({
                success: true,
                userId: updatedParticipant.userId,
                role: updatedParticipant.role
            });

            console.log(`[Role] Assigned ${updatedParticipant.username} -> ${targetRole} by Host in ${roomId}`);
        });

        // ==========================================
        // TRANSFER HOST (Host Only)
        // ==========================================
        socket.on("transfer_host", ({ userId }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) {
                return callback?.({ success: false, message: "User is not in a room" });
            }

            if (participant.role !== "HOST") {
                return callback?.({
                    success: false,
                    message: "Unauthorized: Only current Host can transfer host status"
                });
            }

            if (userId === participant.userId) {
                return callback?.({ success: false, message: "You are already the host" });
            }

            const success = room.transferHost(userId);
            if (!success) {
                return callback?.({ success: false, message: "Target participant not found" });
            }

            const participants = room.getParticipants();

            io.to(roomId).emit("host_transferred", {
                newHostId: userId,
                previousHostId: participant.userId,
                participants
            });

            callback?.({ success: true, newHostId: userId });
            console.log(`[Host] Host transferred to ${userId} in ${roomId}`);
        });

        // ==========================================
        // REMOVE PARTICIPANT (Host Only)
        // ==========================================
        socket.on("remove_participant", ({ userId }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) {
                return callback?.({ success: false, message: "User is not in a room" });
            }

            if (participant.role !== "HOST") {
                return callback?.({
                    success: false,
                    message: "Unauthorized: Only the Host can remove participants"
                });
            }

            if (userId === room.hostId) {
                return callback?.({ success: false, message: "Host cannot be removed" });
            }

            const targetParticipant = room.getParticipant(userId);
            if (!targetParticipant) {
                return callback?.({ success: false, message: "Participant not found" });
            }

            room.removeParticipant(userId);
            const participants = room.getParticipants();

            io.to(roomId).emit("participant_removed", {
                userId,
                username: targetParticipant.username,
                participants
            });

            // Disconnect all sockets belonging to kicked user in this room
            for (const s of io.sockets.sockets.values()) {
                if (s.data.userId === userId && s.data.roomId === roomId) {
                    s.leave(roomId);
                    s.data.roomId = null;
                    s.data.userId = null;
                }
            }

            callback?.({ success: true, userId, participants });
            console.log(`[Kick] ${targetParticipant.username} removed from ${roomId} by Host`);
        });

        // ==========================================
        // REQUEST MODERATOR (Participants)
        // ==========================================
        socket.on("request_moderator", ({ userId }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) {
                return callback?.({ success: false, message: "Room not found" });
            }

            if (participant.role === "HOST" || participant.role === "MODERATOR") {
                return callback?.({ success: false, message: "You already have elevated permissions" });
            }

            const request = room.requestModerator(participant.userId, participant.username);

            // Notify Host and existing Moderators
            io.to(roomId).emit("moderator_request", {
                userId: participant.userId,
                username: participant.username,
                requestedAt: request.requestedAt
            });

            callback?.({ success: true });
            console.log(`[Permission] ${participant.username} requested Moderator role in ${roomId}`);
        });

        // Dismiss moderator request
        socket.on("dismiss_moderator_request", ({ userId }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant || !participant.hasControlPermission()) {
                return callback?.({ success: false, message: "Unauthorized" });
            }

            room.dismissModeratorRequest(userId);
            io.to(roomId).emit("moderator_request_dismissed", { userId });
            callback?.({ success: true });
        });

        // ==========================================
        // CHAT MESSAGE (Bonus Feature)
        // ==========================================
        socket.on("chat_message", ({ text }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) {
                return callback?.({ success: false, message: "User is not in a room" });
            }

            if (!text || !text.trim()) {
                return callback?.({ success: false, message: "Message cannot be empty" });
            }

            const message = room.addChatMessage(
                participant.userId,
                participant.username,
                text.trim(),
                participant.role
            );

            io.to(roomId).emit("chat_message", message);
            callback?.({ success: true, message });
        });

        // ==========================================
        // EMOJI REACTION (Bonus Feature)
        // ==========================================
        socket.on("send_reaction", ({ emoji }, callback) => {
            const { room, participant, roomId } = getSessionContext();

            if (!room || !participant) return;

            const reaction = {
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                emoji: emoji || "🔥",
                senderName: participant.username,
                timestamp: Date.now()
            };

            io.to(roomId).emit("reaction", reaction);
            callback?.({ success: true });
        });

        // ==========================================
        // DISCONNECT
        // ==========================================
        socket.on("disconnect", () => {
            console.log(`[Socket] Client disconnected: ${socket.id}`);
            // Note: We retain participant record for reconnections.
            // Explicit leaving happens via leave_room.
        });
    });
}

module.exports = registerSocketHandlers;