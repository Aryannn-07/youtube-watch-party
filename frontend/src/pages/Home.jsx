import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Users, Sparkles, Tv, ShieldCheck, MessageSquare, ArrowRight, Video } from "lucide-react";
import socket from "../services/socket";

function Home() {
    const getUserId = () => {
        let userId = sessionStorage.getItem("watchPartyUserId");
        if (!userId) {
            userId = crypto.randomUUID();
            sessionStorage.setItem("watchPartyUserId", userId);
        }
        return userId;
    };

    const [username, setUsername] = useState(() => {
        const stored = sessionStorage.getItem("watchPartyUser");
        if (stored) {
            try {
                return JSON.parse(stored).username || "";
            } catch (e) {
                return "";
            }
        }
        return "";
    });

    const [roomId, setRoomId] = useState("");
    const [selectedVideo, setSelectedVideo] = useState("dQw4w9WgXcQ");
    const [loadingCreate, setLoadingCreate] = useState(false);
    const [loadingJoin, setLoadingJoin] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const navigate = useNavigate();

    const sampleVideos = [
        { label: "Classic Beats", id: "jfKfPfyJRdk" },
        { label: "Lofi Hip Hop", id: "jfKfPfyJRdk" },
        { label: "Synthwave Radio", id: "4xDzrJKXOOY" },
        { label: "4K Nature Walk", id: "Bey4XXJAqS8" }
    ];

    const handleCreateRoom = (e) => {
        e?.preventDefault();
        setErrorMessage("");

        if (!username.trim()) {
            setErrorMessage("Please enter your display name to create a room.");
            return;
        }

        setLoadingCreate(true);
        const userId = getUserId();

        socket.emit(
            "create_room",
            {
                username: username.trim(),
                userId,
                defaultVideoId: selectedVideo
            },
            (response) => {
                setLoadingCreate(false);
                if (!response || !response.success) {
                    setErrorMessage(response?.message || "Failed to create room. Please try again.");
                    return;
                }

                sessionStorage.setItem(
                    "watchPartyUser",
                    JSON.stringify({
                        username: username.trim(),
                        userId: response.userId,
                        role: response.role,
                        roomId: response.roomId,
                        participants: response.participants
                    })
                );

                navigate(`/room/${response.roomId}`);
            }
        );
    };

    const handleJoinRoom = (e) => {
        e?.preventDefault();
        setErrorMessage("");

        if (!username.trim()) {
            setErrorMessage("Please enter your display name.");
            return;
        }

        if (!roomId.trim()) {
            setErrorMessage("Please enter a valid 6-character room code.");
            return;
        }

        setLoadingJoin(true);
        const userId = getUserId();
        const cleanRoomId = roomId.trim().toUpperCase();

        socket.emit(
            "join_room",
            {
                roomId: cleanRoomId,
                username: username.trim(),
                userId
            },
            (response) => {
                setLoadingJoin(false);
                if (!response || !response.success) {
                    setErrorMessage(response?.message || "Room not found. Check the room code.");
                    return;
                }

                sessionStorage.setItem(
                    "watchPartyUser",
                    JSON.stringify({
                        username: username.trim(),
                        userId: response.userId,
                        role: response.role,
                        roomId: response.roomId,
                        participants: response.participants
                    })
                );

                navigate(`/room/${response.roomId}`);
            }
        );
    };

    return (
        <div className="home-container">
            {/* Hero Section */}
            <header className="home-hero">
                <div className="home-badge">
                    <span className="pulse-dot"></span>
                    <span>Real-Time WebSocket Synchronization</span>
                </div>
                <h1 className="home-title">SyncParty Cinema</h1>
                <p className="home-subtitle">
                    Watch YouTube videos in perfect lockstep synchronization with friends.
                    Full role-based controls, seek sync, live reactions, and instant room sharing.
                </p>
            </header>

            {/* Error Banner */}
            {errorMessage && (
                <div
                    style={{
                        maxWidth: "840px",
                        width: "100%",
                        padding: "14px 18px",
                        marginBottom: "24px",
                        background: "rgba(244, 63, 94, 0.15)",
                        border: "1px solid rgba(244, 63, 94, 0.4)",
                        borderRadius: "10px",
                        color: "#fda4af",
                        fontSize: "14px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        zIndex: 1
                    }}
                >
                    <strong>Notice:</strong> {errorMessage}
                </div>
            )}

            {/* Main Interactive Grid */}
            <main className="home-card-grid">
                {/* Create Room Card */}
                <section className="action-card featured">
                    <div className="card-header-icon">
                        <Sparkles size={24} />
                    </div>
                    <h2 className="card-title">Create a Watch Party</h2>
                    <p className="card-desc">
                        Start a new room as Host. You will have full playback control and permission management.
                    </p>

                    <form onSubmit={handleCreateRoom}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="create-username">Your Display Name</label>
                            <input
                                id="create-username"
                                type="text"
                                className="input-base"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="e.g. Alex, Jordan, Sarah"
                                maxLength={25}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Initial Video Preset</label>
                            <div className="video-quick-pills">
                                {sampleVideos.map((vid) => (
                                    <button
                                        type="button"
                                        key={vid.id + vid.label}
                                        onClick={() => setSelectedVideo(vid.id)}
                                        className={`video-quick-pill ${selectedVideo === vid.id ? "active" : ""}`}
                                        style={{
                                            borderColor: selectedVideo === vid.id ? "var(--primary)" : "",
                                            color: selectedVideo === vid.id ? "#fff" : ""
                                        }}
                                    >
                                        {vid.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: "100%", marginTop: "12px" }}
                            disabled={loadingCreate}
                        >
                            {loadingCreate ? (
                                "Creating Party..."
                            ) : (
                                <>
                                    <span>Create Party Room</span>
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>
                </section>

                {/* Join Room Card */}
                <section className="action-card">
                    <div className="card-header-icon" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" }}>
                        <Users size={24} />
                    </div>
                    <h2 className="card-title">Join an Existing Party</h2>
                    <p className="card-desc">
                        Have a room code or link? Enter it below to join the party as a participant.
                    </p>

                    <form onSubmit={handleJoinRoom}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="join-username">Your Display Name</label>
                            <input
                                id="join-username"
                                type="text"
                                className="input-base"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="e.g. Sam, Morgan"
                                maxLength={25}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="room-code">Room Code</label>
                            <input
                                id="room-code"
                                type="text"
                                className="input-base"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                                placeholder="6-digit code (e.g. 7A8B9C)"
                                maxLength={10}
                                style={{ fontFamily: "var(--font-mono)", letterSpacing: "1px", textTransform: "uppercase" }}
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-secondary"
                            style={{ width: "100%", marginTop: "12px" }}
                            disabled={loadingJoin}
                        >
                            {loadingJoin ? (
                                "Connecting..."
                            ) : (
                                <>
                                    <span>Enter Watch Room</span>
                                    <Play size={16} />
                                </>
                            )}
                        </button>
                    </form>
                </section>
            </main>

            {/* Feature Highlights Strip */}
            <aside className="features-strip">
                <div className="feature-pill">
                    <Tv size={16} color="var(--primary)" />
                    <span>Real-Time Lockstep Sync</span>
                </div>
                <div className="feature-pill">
                    <ShieldCheck size={16} color="var(--amber)" />
                    <span>Role-Based Permissions (Host / Mod)</span>
                </div>
                <div className="feature-pill">
                    <MessageSquare size={16} color="var(--cyan)" />
                    <span>Live Room Chat</span>
                </div>
                <div className="feature-pill">
                    <Sparkles size={16} color="var(--secondary)" />
                    <span>Emoji Reaction Bursts</span>
                </div>
            </aside>
        </div>
    );
}

export default Home;