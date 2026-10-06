const { io } = require("socket.io-client");

const SERVER_URL = "http://localhost:5000";

async function runTests() {
    console.log("=== STARTING FULL WEBSOCKET & RBAC TEST SUITE ===\n");

    const hostSocket = io(SERVER_URL);
    const participantSocket = io(SERVER_URL);

    await new Promise((resolve) => {
        let connectedCount = 0;
        const check = () => {
            connectedCount++;
            if (connectedCount === 2) resolve();
        };
        hostSocket.on("connect", check);
        participantSocket.on("connect", check);
    });

    console.log("✔ Connected both Host and Participant sockets to server");

    // 1. Host creates room
    let roomId = null;
    await new Promise((resolve, reject) => {
        hostSocket.emit(
            "create_room",
            { username: "Alice (Host)", userId: "user-host-1", defaultVideoId: "dQw4w9WgXcQ" },
            (res) => {
                if (res.success) {
                    roomId = res.roomId;
                    console.log(`✔ Step 1: Room created successfully with ID: ${roomId}, role: ${res.role}`);
                    resolve();
                } else {
                    reject(new Error(res.message));
                }
            }
        );
    });

    // 2. Participant joins room
    await new Promise((resolve, reject) => {
        let syncStateReceived = false;

        participantSocket.on("sync_state", (state) => {
            syncStateReceived = true;
            console.log(`✔ Step 2b: Participant received initial sync_state:`, state);
        });

        participantSocket.emit(
            "join_room",
            { roomId, username: "Bob (Participant)", userId: "user-part-2" },
            (res) => {
                if (res.success && res.role === "PARTICIPANT") {
                    console.log(`✔ Step 2a: Participant joined room with role: ${res.role}`);
                    setTimeout(resolve, 100);
                } else {
                    reject(new Error(res.message));
                }
            }
        );
    });

    // 3. Host plays video -> Participant receives play event
    await new Promise((resolve) => {
        participantSocket.once("play", (data) => {
            console.log(`✔ Step 3: Participant received play event at ${data.currentTime}s`);
            resolve();
        });

        hostSocket.emit("play", { currentTime: 45.5 }, (res) => {
            if (!res.success) console.error("Host play failed:", res.message);
        });
    });

    // 4. Host pauses video -> Participant receives pause event
    await new Promise((resolve) => {
        participantSocket.once("pause", (data) => {
            console.log(`✔ Step 4: Participant received pause event at ${data.currentTime}s`);
            resolve();
        });

        hostSocket.emit("pause", { currentTime: 50.0 });
    });

    // 5. Host seeks video -> Participant receives seek event
    await new Promise((resolve) => {
        participantSocket.once("seek", (data) => {
            console.log(`✔ Step 5: Participant received seek event at ${data.currentTime}s`);
            resolve();
        });

        hostSocket.emit("seek", { time: 120.0 });
    });

    // 6. RBAC Verification: Participant tries to play video -> MUST BE REJECTED!
    await new Promise((resolve) => {
        participantSocket.emit("play", { currentTime: 15.0 }, (res) => {
            if (!res.success) {
                console.log(`✔ Step 6: RBAC verified! Participant play rejected with message: "${res.message}"`);
                resolve();
            } else {
                console.error("FAIL: Participant should not be able to play!");
                process.exit(1);
            }
        });
    });

    // 7. Host assigns MODERATOR role to Participant
    await new Promise((resolve) => {
        participantSocket.once("role_assigned", (data) => {
            console.log(`✔ Step 7: Participant notified of promotion to ${data.role}`);
            resolve();
        });

        hostSocket.emit("assign_role", { userId: "user-part-2", role: "MODERATOR" }, (res) => {
            if (!res.success) console.error("Role assignment failed:", res.message);
        });
    });

    // 8. Newly promoted Moderator plays video -> MUST BE ALLOWED!
    await new Promise((resolve) => {
        hostSocket.once("play", (data) => {
            console.log(`✔ Step 8: Moderator play event broadcast to Host at ${data.currentTime}s`);
            resolve();
        });

        participantSocket.emit("play", { currentTime: 200.0 }, (res) => {
            if (res.success) {
                console.log("✔ Moderator play action authorized by server");
            } else {
                console.error("FAIL: Moderator play was rejected:", res.message);
            }
        });
    });

    // 9. Change video synchronization
    await new Promise((resolve) => {
        participantSocket.once("change_video", (data) => {
            console.log(`✔ Step 9: Participant received video change to ID: ${data.videoId}`);
            resolve();
        });

        hostSocket.emit("change_video", { videoId: "jfKfPfyJRdk" });
    });

    // 10. Chat messaging
    await new Promise((resolve) => {
        hostSocket.once("chat_message", (data) => {
            console.log(`✔ Step 10: Chat message received from ${data.senderName}: "${data.text}"`);
            resolve();
        });

        participantSocket.emit("chat_message", { text: "Hello from the watch party!" });
    });

    // 11. Emoji reactions
    await new Promise((resolve) => {
        hostSocket.once("reaction", (data) => {
            console.log(`✔ Step 11: Reaction received: ${data.emoji} from ${data.senderName}`);
            resolve();
        });

        participantSocket.emit("send_reaction", { emoji: "🔥" });
    });

    // 12. Host transfer
    await new Promise((resolve) => {
        hostSocket.once("host_transferred", (data) => {
            console.log(`✔ Step 12: Host transferred to ${data.newHostId}`);
            resolve();
        });

        hostSocket.emit("transfer_host", { userId: "user-part-2" });
    });

    // Clean disconnect
    hostSocket.disconnect();
    participantSocket.disconnect();

    console.log("\n=======================================================");
    console.log("🎉 ALL TESTS PASSED! FULL REAL-TIME & RBAC COMPLIANCE VERIFIED!");
    console.log("=======================================================\n");
    process.exit(0);
}

runTests().catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
