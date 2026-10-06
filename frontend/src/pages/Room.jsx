import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import YouTube from "react-youtube";
import {
    Play,
    Pause,
    RotateCcw,
    RotateCw,
    Share2,
    Copy,
    LogOut,
    Users,
    MessageSquare,
    Info,
    Shield,
    ShieldAlert,
    UserCheck,
    UserMinus,
    Crown,
    Send,
    Flame,
    Heart,
    Smile,
    PartyPopper,
    Radio,
    Check,
    AlertCircle
} from "lucide-react";
import socket from "../services/socket";

// Helper to extract YouTube ID from full URL, short URL, embed URL, or direct ID
function extractYouTubeVideoId(value) {
    if (!value) return null;
    const input = value.trim();

    if (/^[A-Za-z0-9_-]{11}$/.test(input)) {
        return input;
    }

    try {
        const url = new URL(input);
        if (url.hostname === "youtu.be") {
            return url.pathname.substring(1).split("?")[0];
        }
        if (url.hostname.includes("youtube.com") || url.hostname.includes("youtube-nocookie.com")) {
            const id = url.searchParams.get("v");
            if (id) return id;

            const match = url.pathname.match(/\/embed\/([^/?]+)/);
            if (match) return match[1];

            const shortMatch = url.pathname.match(/\/shorts\/([^/?]+)/);
            if (shortMatch) return shortMatch[1];
        }
    } catch (e) {
        return null;
    }
    return null;
}

function Room() {
    const { roomId } = useParams();
    const navigate = useNavigate();

    // Session & User State
    const [user, setUser] = useState(() => {
        const stored = sessionStorage.getItem("watchPartyUser");
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                return null;
            }
        }
        return null;
    });

    // Room participants & roles
    const [participants, setParticipants] = useState([]);
    const [moderatorRequests, setModeratorRequests] = useState([]);

    // Video & Playback State
    const [videoId, setVideoId] = useState("dQw4w9WgXcQ");
    const [videoInput, setVideoInput] = useState("");
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentPlayTime, setCurrentPlayTime] = useState(0);

    // Chat State
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const chatEndRef = useRef(null);

    // Active Sidebar Tab: "participants" | "chat" | "info"
    const [activeTab, setActiveTab] = useState("participants");

    // UI Feedback: Toasts & Reactions
    const [toasts, setToasts] = useState([]);
    const [floatingReactions, setFloatingReactions] = useState([]);
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);

    // Direct Join Prompt Modal (when visiting via URL directly without session)
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [joinModalName, setJoinModalName] = useState("");
    const [joinModalError, setJoinModalError] = useState("");

    // Player references and remote action sync lock
    const playerRef = useRef(null);
    const previousTimeRef = useRef(null);
    const isRemoteActionRef = useRef(false);

    const isHost = user?.role === "HOST";
    const isModerator = user?.role === "MODERATOR";
    const hasControl = isHost || isModerator;

    const addToast = useCallback((text, type = "info") => {
        const id = `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev.slice(-3), { id, text, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const triggerReactionEffect = useCallback((emoji, senderName) => {
        const id = `${Date.now()}-${Math.random()}`;
        const randomLeft = Math.floor(Math.random() * 70) + 15; // 15% to 85%
        setFloatingReactions((prev) => [...prev, { id, emoji, senderName, left: `${randomLeft}%` }]);
        setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
        }, 2200);
    }, []);

    // Scroll chat to bottom on new message
    useEffect(() => {
        if (activeTab === "chat") {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [chatMessages, activeTab]);

    // ==========================================
    // INITIALIZATION & DIRECT JOIN HANDLING
    // ==========================================
    useEffect(() => {
        const stored = sessionStorage.getItem("watchPartyUser");
        let currentUser = null;

        if (stored) {
            try {
                currentUser = JSON.parse(stored);
            } catch (e) {
                currentUser = null;
            }
        }

        // If no user identity or room mismatch, show join modal
        if (!currentUser || currentUser.roomId !== roomId?.toUpperCase()) {
            setShowJoinModal(true);
            return;
        }

        setUser(currentUser);
        setParticipants(currentUser.participants || []);

        // Restore room connection
        const restoreSession = () => {
            socket.emit(
                "restore_room",
                { roomId, userId: currentUser.userId },
                (response) => {
                    if (!response || !response.success) {
                        // Room doesn't exist or session expired
                        setShowJoinModal(true);
                        return;
                    }

                    const updatedUser = {
                        ...currentUser,
                        username: response.username,
                        userId: response.userId,
                        role: response.role,
                        roomId: response.roomId,
                        participants: response.participants
                    };

                    setUser(updatedUser);
                    setParticipants(response.participants || []);
                    if (response.messages) setChatMessages(response.messages);
                    if (response.pendingRequests) setModeratorRequests(response.pendingRequests);

                    sessionStorage.setItem("watchPartyUser", JSON.stringify(updatedUser));

                    if (response.syncState) {
                        applySyncState(response.syncState);
                    }
                }
            );
        };

        if (socket.connected) {
            restoreSession();
        }
        socket.on("connect", restoreSession);

        return () => {
            socket.off("connect", restoreSession);
        };
    }, [roomId]);

    // ==========================================
    // APPLY SYNC STATE HELPER
    // ==========================================
    const applySyncState = useCallback((state) => {
        if (!state) return;

        if (state.videoId && state.videoId !== videoId) {
            setVideoId(state.videoId);
            setVideoInput(`https://www.youtube.com/watch?v=${state.videoId}`);
        }

        if (playerRef.current) {
            const playerTime = playerRef.current.getCurrentTime?.() || 0;
            const targetTime = state.currentTime || 0;

            if (Math.abs(playerTime - targetTime) > 1.5) {
                isRemoteActionRef.current = true;
                playerRef.current.seekTo(targetTime, true);
                setTimeout(() => {
                    isRemoteActionRef.current = false;
                }, 500);
            }

            if (state.playState === "PLAYING") {
                isRemoteActionRef.current = true;
                playerRef.current.playVideo?.();
                setIsPlaying(true);
                setTimeout(() => {
                    isRemoteActionRef.current = false;
                }, 500);
            } else if (state.playState === "PAUSED") {
                isRemoteActionRef.current = true;
                playerRef.current.pauseVideo?.();
                setIsPlaying(false);
                setTimeout(() => {
                    isRemoteActionRef.current = false;
                }, 500);
            }
        }
    }, [videoId]);

    // ==========================================
    // SOCKET LISTENERS
    // ==========================================
    useEffect(() => {
        const handleUserJoined = (data) => {
            setParticipants(data.participants || []);
            addToast(`${data.username} joined the party`, "info");
        };

        const handleUserLeft = (data) => {
            setParticipants(data.participants || []);
            addToast(`${data.username || "A user"} left the party`, "info");
        };

        const handleSyncState = (data) => {
            applySyncState(data);
        };

        const handleRemotePlay = (data) => {
            if (!playerRef.current) return;
            isRemoteActionRef.current = true;
            if (typeof data.currentTime === "number") {
                playerRef.current.seekTo(data.currentTime, true);
            }
            playerRef.current.playVideo?.();
            setIsPlaying(true);
            setTimeout(() => {
                isRemoteActionRef.current = false;
            }, 500);
            if (data.by) addToast(`${data.by} resumed playback`);
        };

        const handleRemotePause = (data) => {
            if (!playerRef.current) return;
            isRemoteActionRef.current = true;
            if (typeof data.currentTime === "number") {
                playerRef.current.seekTo(data.currentTime, true);
            }
            playerRef.current.pauseVideo?.();
            setIsPlaying(false);
            setTimeout(() => {
                isRemoteActionRef.current = false;
            }, 500);
            if (data.by) addToast(`${data.by} paused playback`);
        };

        const handleRemoteSeek = (data) => {
            if (!playerRef.current) return;
            isRemoteActionRef.current = true;
            playerRef.current.seekTo(data.currentTime, true);
            setTimeout(() => {
                isRemoteActionRef.current = false;
            }, 500);
            if (data.by) addToast(`${data.by} jumped to ${Math.floor(data.currentTime)}s`);
        };

        const handleRemoteChangeVideo = (data) => {
            setVideoId(data.videoId);
            setVideoInput(`https://www.youtube.com/watch?v=${data.videoId}`);
            setIsPlaying(false);
            addToast(`Video updated${data.by ? ` by ${data.by}` : ""}`);
        };

        const handleRoleAssigned = (data) => {
            setParticipants(data.participants || []);

            setUser((prev) => {
                if (prev && prev.userId === data.userId) {
                    const updated = { ...prev, role: data.role };
                    sessionStorage.setItem("watchPartyUser", JSON.stringify(updated));
                    return updated;
                }
                return prev;
            });

            addToast(`${data.username} is now a ${data.role}`);
        };

        const handleHostTransferred = (data) => {
            setParticipants(data.participants || []);

            setUser((prev) => {
                if (!prev) return prev;
                let newRole = prev.role;
                if (prev.userId === data.newHostId) newRole = "HOST";
                else if (prev.userId === data.previousHostId) newRole = "MODERATOR";

                const updated = { ...prev, role: newRole };
                sessionStorage.setItem("watchPartyUser", JSON.stringify(updated));
                return updated;
            });

            addToast("Host privilege transferred to new leader", "info");
        };

        const handleParticipantRemoved = (data) => {
            setUser((prev) => {
                if (prev && prev.userId === data.userId) {
                    sessionStorage.removeItem("watchPartyUser");
                    alert("You have been removed from this party by the host.");
                    navigate("/");
                    return null;
                }
                return prev;
            });

            if (data.participants) {
                setParticipants(data.participants);
            }
            addToast(`${data.username || "A participant"} was removed`, "warning");
        };

        const handleModeratorRequest = (data) => {
            setModeratorRequests((current) => {
                if (current.some((req) => req.userId === data.userId)) return current;
                return [...current, data];
            });
            addToast(`${data.username} requested Moderator access`, "warning");
        };

        const handleModeratorRequestDismissed = (data) => {
            setModeratorRequests((current) => current.filter((req) => req.userId !== data.userId));
        };

        const handleChatMessage = (message) => {
            setChatMessages((prev) => [...prev, message]);
        };

        const handleReaction = (reaction) => {
            triggerReactionEffect(reaction.emoji, reaction.senderName);
        };

        socket.on("user_joined", handleUserJoined);
        socket.on("user_left", handleUserLeft);
        socket.on("sync_state", handleSyncState);
        socket.on("play", handleRemotePlay);
        socket.on("pause", handleRemotePause);
        socket.on("seek", handleRemoteSeek);
        socket.on("change_video", handleRemoteChangeVideo);
        socket.on("role_assigned", handleRoleAssigned);
        socket.on("host_transferred", handleHostTransferred);
        socket.on("participant_removed", handleParticipantRemoved);
        socket.on("moderator_request", handleModeratorRequest);
        socket.on("moderator_request_dismissed", handleModeratorRequestDismissed);
        socket.on("chat_message", handleChatMessage);
        socket.on("reaction", handleReaction);

        return () => {
            socket.off("user_joined", handleUserJoined);
            socket.off("user_left", handleUserLeft);
            socket.off("sync_state", handleSyncState);
            socket.off("play", handleRemotePlay);
            socket.off("pause", handleRemotePause);
            socket.off("seek", handleRemoteSeek);
            socket.off("change_video", handleRemoteChangeVideo);
            socket.off("role_assigned", handleRoleAssigned);
            socket.off("host_transferred", handleHostTransferred);
            socket.off("participant_removed", handleParticipantRemoved);
            socket.off("moderator_request", handleModeratorRequest);
            socket.off("moderator_request_dismissed", handleModeratorRequestDismissed);
            socket.off("chat_message", handleChatMessage);
            socket.off("reaction", handleReaction);
        };
    }, [addToast, applySyncState, triggerReactionEffect, navigate]);

    // ==========================================
    // SCRUB / SEEK DETECTION FOR CONTROLLERS
    // ==========================================
    useEffect(() => {
        if (!hasControl) return;

        const interval = setInterval(() => {
            if (!playerRef.current?.getCurrentTime) return;

            const time = playerRef.current.getCurrentTime();
            setCurrentPlayTime(time);

            if (previousTimeRef.current === null) {
                previousTimeRef.current = time;
                return;
            }

            const diff = Math.abs(time - previousTimeRef.current);

            // If time jumped forward or backward by > 1.8s (scrub / seek)
            if (diff > 1.8 && !isRemoteActionRef.current) {
                socket.emit("seek", { currentTime: time });
            }

            previousTimeRef.current = time;
        }, 400);

        return () => clearInterval(interval);
    }, [hasControl]);

    // ==========================================
    // MODAL DIRECT JOIN HANDLER
    // ==========================================
    const handleModalJoin = (e) => {
        e?.preventDefault();
        setJoinModalError("");

        if (!joinModalName.trim()) {
            setJoinModalError("Please enter your name.");
            return;
        }

        let userId = sessionStorage.getItem("watchPartyUserId");
        if (!userId) {
            userId = crypto.randomUUID();
            sessionStorage.setItem("watchPartyUserId", userId);
        }

        const cleanRoomId = roomId.trim().toUpperCase();

        socket.emit(
            "join_room",
            {
                roomId: cleanRoomId,
                username: joinModalName.trim(),
                userId
            },
            (response) => {
                if (!response || !response.success) {
                    setJoinModalError(response?.message || "Failed to join room.");
                    return;
                }

                const newUser = {
                    username: joinModalName.trim(),
                    userId: response.userId,
                    role: response.role,
                    roomId: response.roomId,
                    participants: response.participants
                };

                setUser(newUser);
                setParticipants(response.participants || []);
                if (response.messages) setChatMessages(response.messages);
                sessionStorage.setItem("watchPartyUser", JSON.stringify(newUser));
                setShowJoinModal(false);

                if (response.syncState) {
                    applySyncState(response.syncState);
                }
            }
        );
    };

    // ==========================================
    // VIDEO PLAYER HANDLERS
    // ==========================================
    const handlePlayerReady = (event) => {
        playerRef.current = event.target;
        socket.emit("request_sync");
    };

    const handlePlayerPlay = () => {
        if (isRemoteActionRef.current) return;

        if (!hasControl) {
            // Participant cannot start playback if host was paused
            addToast("Only Host or Moderators can initiate playback", "warning");
            return;
        }

        setIsPlaying(true);
        const time = playerRef.current?.getCurrentTime?.() || 0;
        socket.emit("play", { currentTime: time });
    };

    const handlePlayerPause = () => {
        if (isRemoteActionRef.current) return;

        if (!hasControl) {
            // Participant cannot pause playback
            addToast("Only Host or Moderators can pause playback", "warning");
            return;
        }

        setIsPlaying(false);
        const time = playerRef.current?.getCurrentTime?.() || 0;
        socket.emit("pause", { currentTime: time });
    };

    // Controls Toolbar Actions (Play, Pause, Step Back, Step Forward)
    const handleManualPlay = () => {
        if (!hasControl) return;
        setIsPlaying(true);
        playerRef.current?.playVideo?.();
        const time = playerRef.current?.getCurrentTime?.() || 0;
        socket.emit("play", { currentTime: time });
    };

    const handleManualPause = () => {
        if (!hasControl) return;
        setIsPlaying(false);
        playerRef.current?.pauseVideo?.();
        const time = playerRef.current?.getCurrentTime?.() || 0;
        socket.emit("pause", { currentTime: time });
    };

    const handleManualSeekRelative = (seconds) => {
        if (!hasControl || !playerRef.current) return;
        const currentTime = playerRef.current.getCurrentTime?.() || 0;
        const target = Math.max(0, currentTime + seconds);
        playerRef.current.seekTo(target, true);
        socket.emit("seek", { currentTime: target });
    };

    const handleChangeVideoSubmit = (e) => {
        e?.preventDefault();
        if (!hasControl) {
            addToast("Only Host or Moderators can change video", "warning");
            return;
        }

        const extracted = extractYouTubeVideoId(videoInput);
        if (!extracted) {
            addToast("Invalid YouTube URL or ID", "warning");
            return;
        }

        socket.emit("change_video", { videoId: extracted }, (res) => {
            if (!res?.success) {
                addToast(res?.message || "Failed to change video", "warning");
            }
        });
    };

    // ==========================================
    // ROLE & PARTICIPANT ACTIONS
    // ==========================================
    const handleAssignRole = (targetUserId, targetRole) => {
        if (!isHost) return;
        socket.emit("assign_role", { userId: targetUserId, role: targetRole }, (res) => {
            if (!res?.success) addToast(res?.message || "Role assignment failed", "warning");
        });
    };

    const handleTransferHost = (targetUserId) => {
        if (!isHost) return;
        if (confirm("Are you sure you want to transfer Host leadership? You will become a Moderator.")) {
            socket.emit("transfer_host", { userId: targetUserId }, (res) => {
                if (!res?.success) addToast(res?.message || "Transfer failed", "warning");
            });
        }
    };

    const handleRemoveParticipant = (targetUserId) => {
        if (!isHost) return;
        socket.emit("remove_participant", { userId: targetUserId }, (res) => {
            if (!res?.success) addToast(res?.message || "Failed to remove user", "warning");
        });
    };

    const handleRequestModerator = () => {
        if (!user || hasControl) return;
        socket.emit("request_moderator", { userId: user.userId }, (res) => {
            if (res?.success) addToast("Moderator request sent to Host!", "info");
        });
    };

    const handleApproveModRequest = (reqUserId) => {
        handleAssignRole(reqUserId, "MODERATOR");
        setModeratorRequests((current) => current.filter((r) => r.userId !== reqUserId));
    };

    const handleDismissModRequest = (reqUserId) => {
        socket.emit("dismiss_moderator_request", { userId: reqUserId });
        setModeratorRequests((current) => current.filter((r) => r.userId !== reqUserId));
    };

    // ==========================================
    // CHAT & REACTIONS
    // ==========================================
    const handleSendChat = (e) => {
        e?.preventDefault();
        if (!chatInput.trim()) return;

        socket.emit("chat_message", { text: chatInput.trim() }, (res) => {
            if (res?.success) setChatInput("");
        });
    };

    const handleSendReaction = (emoji) => {
        socket.emit("send_reaction", { emoji });
        triggerReactionEffect(emoji, user?.username);
    };

    // ==========================================
    // ROOM SHARE & LEAVE
    // ==========================================
    const handleCopyRoomCode = () => {
        navigator.clipboard.writeText(roomId);
        setCopiedCode(true);
        addToast("Room code copied to clipboard!");
        setTimeout(() => setCopiedCode(false), 2000);
    };

    const handleCopyShareLink = () => {
        const shareUrl = window.location.href;
        navigator.clipboard.writeText(shareUrl);
        setCopiedLink(true);
        addToast("Full invite link copied to clipboard!");
        setTimeout(() => setCopiedLink(false), 2000);
    };

    const handleLeaveRoom = () => {
        if (confirm("Leave this watch party?")) {
            socket.emit("leave_room", { roomId });
            sessionStorage.removeItem("watchPartyUser");
            navigate("/");
        }
    };

    return (
        <div className="room-page">
            {/* Top Navigation Bar */}
            <header className="room-header">
                <div className="brand-badge" onClick={() => navigate("/")}>
                    <div className="brand-icon">
                        <Radio size={18} />
                    </div>
                    <span>SyncParty</span>
                </div>

                <div className="room-meta">
                    <div className="room-code-tag">
                        <span style={{ color: "var(--text-muted)" }}>Room:</span>
                        <span>{roomId}</span>
                        <button
                            type="button"
                            onClick={handleCopyRoomCode}
                            className="btn btn-icon btn-secondary"
                            title="Copy Room Code"
                            style={{ padding: "4px" }}
                        >
                            {copiedCode ? <Check size={14} color="var(--emerald)" /> : <Copy size={14} />}
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleCopyShareLink}
                        className="btn btn-sm btn-secondary"
                        title="Copy Share Link"
                    >
                        {copiedLink ? <Check size={14} color="var(--emerald)" /> : <Share2 size={14} />}
                        <span className="hide-mobile">Share</span>
                    </button>
                </div>

                <div className="header-user-info">
                    {user && (
                        <>
                            <div className="avatar-circle">
                                {user.username ? user.username.charAt(0) : "U"}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontWeight: 600, fontSize: "13px" }}>{user.username}</span>
                                <span
                                    className={`badge-role ${
                                        user.role === "HOST"
                                            ? "badge-host"
                                            : user.role === "MODERATOR"
                                            ? "badge-moderator"
                                            : "badge-participant"
                                    }`}
                                >
                                    {user.role === "HOST" && <Crown size={10} />}
                                    {user.role}
                                </span>
                            </div>
                        </>
                    )}

                    <button
                        type="button"
                        onClick={handleLeaveRoom}
                        className="btn btn-sm btn-danger"
                        title="Leave Party"
                        style={{ marginLeft: "8px" }}
                    >
                        <LogOut size={14} />
                        <span className="hide-mobile">Leave</span>
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="room-content">
                {/* Left/Center Theatre View */}
                <main className="theatre-section">
                    {/* Host & Moderator Notice or Participant Request Banner */}
                    {!hasControl && (
                        <div className="role-notice-banner">
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <ShieldAlert size={18} />
                                <span>
                                    <strong>Watch-Only Mode:</strong> Playback is controlled by the Host and Moderators.
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={handleRequestModerator}
                                className="btn btn-sm btn-secondary"
                                style={{ background: "rgba(56, 189, 248, 0.15)", borderColor: "rgba(56, 189, 248, 0.4)" }}
                            >
                                Request Control
                            </button>
                        </div>
                    )}

                    {/* Pending Moderator Requests Notification (Visible to Host) */}
                    {isHost && moderatorRequests.length > 0 && (
                        <div className="mod-request-card">
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <AlertCircle size={20} color="var(--amber)" />
                                <div>
                                    <strong style={{ color: "#fef08a" }}>Pending Moderator Requests:</strong>
                                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                        {moderatorRequests.map((r) => r.username).join(", ")} requested permissions.
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                                {moderatorRequests.map((req) => (
                                    <div key={req.userId} style={{ display: "flex", gap: "6px" }}>
                                        <button
                                            type="button"
                                            onClick={() => handleApproveModRequest(req.userId)}
                                            className="btn btn-sm btn-primary"
                                        >
                                            Approve {req.username}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDismissModRequest(req.userId)}
                                            className="btn btn-sm btn-secondary"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Video URL Input Bar (for Host and Moderators) */}
                    {hasControl && (
                        <form onSubmit={handleChangeVideoSubmit} className="video-change-bar">
                            <input
                                type="text"
                                value={videoInput}
                                onChange={(e) => setVideoInput(e.target.value)}
                                placeholder="Paste any YouTube video link or ID (e.g. https://www.youtube.com/watch?v=...)"
                            />
                            <button type="submit" className="btn btn-primary btn-sm">
                                Change Video
                            </button>
                        </form>
                    )}

                    {/* YouTube Video Player Container with Ambient Glow & Floating Reactions */}
                    <div className="video-player-container">
                        <div className="video-iframe-wrapper">
                            <YouTube
                                videoId={videoId}
                                onReady={handlePlayerReady}
                                onPlay={handlePlayerPlay}
                                onPause={handlePlayerPause}
                                opts={{
                                    playerVars: {
                                        autoplay: 0,
                                        controls: hasControl ? 1 : 0, // Restricted playback UI for watch-only
                                        rel: 0,
                                        modestbranding: 1
                                    }
                                }}
                            />
                        </div>

                        {/* Floating Reactions Overlay */}
                        <div className="reactions-overlay">
                            {floatingReactions.map((r) => (
                                <div
                                    key={r.id}
                                    className="floating-reaction"
                                    style={{ left: r.left }}
                                >
                                    <span>{r.emoji}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Playback Controls & Sync Diagnostics Bar */}
                    <div className="playback-controls-bar">
                        <div className="playback-buttons">
                            {hasControl ? (
                                <>
                                    {isPlaying ? (
                                        <button
                                            type="button"
                                            onClick={handleManualPause}
                                            className="btn btn-sm btn-secondary"
                                            title="Pause Video for All"
                                        >
                                            <Pause size={16} />
                                            <span>Pause</span>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleManualPlay}
                                            className="btn btn-sm btn-primary"
                                            title="Play Video for All"
                                        >
                                            <Play size={16} />
                                            <span>Play</span>
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => handleManualSeekRelative(-10)}
                                        className="btn btn-sm btn-secondary"
                                        title="Seek Back 10s"
                                    >
                                        <RotateCcw size={14} />
                                        <span>-10s</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleManualSeekRelative(10)}
                                        className="btn btn-sm btn-secondary"
                                        title="Seek Forward 10s"
                                    >
                                        <RotateCw size={14} />
                                        <span>+10s</span>
                                    </button>
                                </>
                            ) : (
                                <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                                    <span>Sync status: Following party playback</span>
                                </div>
                            )}
                        </div>

                        {/* Sync Status Badge */}
                        <div className="sync-status-indicator">
                            <span className={`status-dot ${isPlaying ? "" : "paused"}`}></span>
                            <span>{isPlaying ? "Live Playing" : "Paused"}</span>
                        </div>

                        {/* Quick Reaction Bar */}
                        <div className="reactions-bar">
                            <button type="button" className="reaction-btn" onClick={() => handleSendReaction("🔥")} title="Fire">
                                🔥
                            </button>
                            <button type="button" className="reaction-btn" onClick={() => handleSendReaction("❤️")} title="Love">
                                ❤️
                            </button>
                            <button type="button" className="reaction-btn" onClick={() => handleSendReaction("👏")} title="Clap">
                                👏
                            </button>
                            <button type="button" className="reaction-btn" onClick={() => handleSendReaction("😂")} title="Laugh">
                                😂
                            </button>
                            <button type="button" className="reaction-btn" onClick={() => handleSendReaction("🍿")} title="Popcorn">
                                🍿
                            </button>
                            <button type="button" className="reaction-btn" onClick={() => handleSendReaction("🎉")} title="Party">
                                🎉
                            </button>
                        </div>
                    </div>
                </main>

                {/* Right Tabbed Sidebar */}
                <aside className="sidebar">
                    {/* Navigation Tabs */}
                    <div className="sidebar-tabs">
                        <button
                            type="button"
                            onClick={() => setActiveTab("participants")}
                            className={`sidebar-tab ${activeTab === "participants" ? "active" : ""}`}
                        >
                            <Users size={16} />
                            <span>Users</span>
                            <span className="tab-badge">{participants.length}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab("chat")}
                            className={`sidebar-tab ${activeTab === "chat" ? "active" : ""}`}
                        >
                            <MessageSquare size={16} />
                            <span>Chat</span>
                            {chatMessages.length > 0 && <span className="tab-badge">{chatMessages.length}</span>}
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab("info")}
                            className={`sidebar-tab ${activeTab === "info" ? "active" : ""}`}
                        >
                            <Info size={16} />
                            <span>Room Info</span>
                        </button>
                    </div>

                    {/* Tab 1: Participants List */}
                    {activeTab === "participants" && (
                        <div className="sidebar-panel">
                            <div className="participants-list">
                                {participants.map((p) => {
                                    const isSelf = p.userId === user?.userId;
                                    const pIsHost = p.role === "HOST";
                                    const pIsMod = p.role === "MODERATOR";

                                    return (
                                        <div key={p.userId} className="participant-item">
                                            <div className="participant-info">
                                                <div className="avatar-circle" style={{ width: "30px", height: "30px", fontSize: "12px" }}>
                                                    {p.username ? p.username.charAt(0) : "U"}
                                                </div>
                                                <div>
                                                    <div className="participant-name">
                                                        <span>{p.username}</span>
                                                        {isSelf && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>(You)</span>}
                                                    </div>
                                                    <span
                                                        className={`badge-role ${
                                                            pIsHost ? "badge-host" : pIsMod ? "badge-moderator" : "badge-participant"
                                                        }`}
                                                    >
                                                        {pIsHost && <Crown size={9} />}
                                                        {p.role}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Host Management Controls */}
                                            {isHost && !isSelf && (
                                                <div className="participant-actions">
                                                    {pIsMod ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAssignRole(p.userId, "PARTICIPANT")}
                                                            className="btn btn-sm btn-secondary"
                                                            title="Demote to Participant"
                                                        >
                                                            Demote
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAssignRole(p.userId, "MODERATOR")}
                                                            className="btn btn-sm btn-secondary"
                                                            title="Promote to Moderator"
                                                        >
                                                            Make Mod
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => handleTransferHost(p.userId)}
                                                        className="btn btn-sm btn-secondary"
                                                        title="Transfer Host"
                                                    >
                                                        <Crown size={12} color="var(--amber)" />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveParticipant(p.userId)}
                                                        className="btn btn-sm btn-danger btn-icon"
                                                        title="Remove from Room"
                                                    >
                                                        <UserMinus size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tab 2: Live Chat */}
                    {activeTab === "chat" && (
                        <div className="sidebar-panel">
                            <div className="chat-messages">
                                {chatMessages.length === 0 ? (
                                    <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: "40px" }}>
                                        <MessageSquare size={32} style={{ margin: "0 auto 10px", opacity: 0.5 }} />
                                        <p>No messages yet.</p>
                                        <p style={{ fontSize: "12px" }}>Say hello to start the party!</p>
                                    </div>
                                ) : (
                                    chatMessages.map((msg) => {
                                        const isMine = msg.senderId === user?.userId;
                                        return (
                                            <div key={msg.id} className={`chat-bubble ${isMine ? "mine" : "theirs"}`}>
                                                {!isMine && (
                                                    <div className="chat-sender-header">
                                                        <span>{msg.senderName}</span>
                                                        <span
                                                            style={{
                                                                fontSize: "9px",
                                                                textTransform: "uppercase",
                                                                color: msg.role === "HOST" ? "var(--amber)" : msg.role === "MODERATOR" ? "var(--primary-light)" : "var(--cyan)"
                                                            }}
                                                        >
                                                            {msg.role}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="chat-text">{msg.text}</div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            <form onSubmit={handleSendChat} className="chat-input-bar">
                                <input
                                    type="text"
                                    className="input-base"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    placeholder="Type a message..."
                                    maxLength={250}
                                />
                                <button type="submit" className="btn btn-primary btn-icon">
                                    <Send size={16} />
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Tab 3: Room Info */}
                    {activeTab === "info" && (
                        <div className="sidebar-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div className="glass-panel" style={{ padding: "16px" }}>
                                <h3 style={{ fontSize: "15px", marginBottom: "8px" }}>Room Details</h3>
                                <div style={{ fontSize: "13px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <div><strong>Room Code:</strong> {roomId}</div>
                                    <div><strong>Active Participants:</strong> {participants.length}</div>
                                    <div><strong>Current Video ID:</strong> {videoId}</div>
                                </div>
                            </div>

                            <div className="glass-panel" style={{ padding: "16px" }}>
                                <h3 style={{ fontSize: "15px", marginBottom: "8px" }}>Permissions</h3>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "8px" }}>
                                    <div><strong style={{ color: "var(--amber)" }}>Host:</strong> Play/pause, seek, video changes, role management, user removal, host transfer.</div>
                                    <div><strong style={{ color: "var(--primary-light)" }}>Moderator:</strong> Play/pause, seek, and video changes.</div>
                                    <div><strong style={{ color: "var(--cyan)" }}>Participant:</strong> Watch only, synchronized in real time. Can request moderator status.</div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleCopyShareLink}
                                className="btn btn-secondary"
                                style={{ width: "100%" }}
                            >
                                <Share2 size={16} />
                                <span>Copy Invite Link</span>
                            </button>
                        </div>
                    )}
                </aside>
            </div>

            {/* Direct Join Modal (For direct link visitors without session) */}
            {showJoinModal && (
                <div className="modal-backdrop">
                    <div className="modal-card">
                        <div className="card-header-icon" style={{ background: "rgba(139, 92, 246, 0.15)", color: "var(--primary)" }}>
                            <Radio size={24} />
                        </div>
                        <h2 className="card-title">Join Watch Party</h2>
                        <p className="card-desc">
                            You're invited to join party <strong>{roomId}</strong>. Enter your display name to start watching together.
                        </p>

                        {joinModalError && (
                            <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "14px" }}>
                                {joinModalError}
                            </div>
                        )}

                        <form onSubmit={handleModalJoin}>
                            <div className="form-group">
                                <label className="form-label" htmlFor="modal-name">Your Display Name</label>
                                <input
                                    id="modal-name"
                                    type="text"
                                    className="input-base"
                                    value={joinModalName}
                                    onChange={(e) => setJoinModalName(e.target.value)}
                                    placeholder="e.g. Jordan, Sam"
                                    autoFocus
                                    maxLength={25}
                                />
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "8px" }}>
                                Enter Party
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Toast Alerts Layer */}
            <div className="toast-container">
                {toasts.map((toast) => (
                    <div key={toast.id} className="toast">
                        <Info size={16} color="var(--primary)" />
                        <span>{toast.text}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Room;