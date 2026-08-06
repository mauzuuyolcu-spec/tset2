document.addEventListener("DOMContentLoaded", () => {

    const joinScreen = document.getElementById("join-screen");
    const chatScreen = document.getElementById("chat-screen");
    const joinForm = document.getElementById("join-form");
    const usernameInput = document.getElementById("username-input");
    const joinError = document.getElementById("join-error");
    const messagesEl = document.getElementById("messages");
    const messageInput = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const imageBtn = document.getElementById("image-btn");
    const imageInput = document.getElementById("image-input");
    const videoBtn = document.getElementById("video-btn");
    const videoInput = document.getElementById("video-input");
    const onlineCountEl = document.getElementById("online-count");
    const typingIndicator = document.getElementById("typing-indicator");
    const typingText = document.getElementById("typing-text");

    let socket = null;
    let myUsername = "";
    let typingTimer = null;

    // Renk fonksiyonu (aynı)
    function getUserColor(name) {
        const colors = ["var(--u1)", "var(--u2)", "var(--u3)", "var(--u4)", "var(--u5)", "var(--u6)", "var(--u7)", "var(--u8)"];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    }

    // Mesaj gönderme
    function sendMessage(text, imageData, videoData) {
        if (!socket) return;
        if (!text && !imageData && !videoData) return;
        socket.emit("send_message", { text, image: imageData || "", video: videoData || "" });
    }

    // Mesaj render (resim/video desteği)
    function renderMessage(msg, isOwn = false) {
        const row = document.createElement("div");
        row.className = `msg-row${isOwn ? " own" : ""}`;

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.style.background = getUserColor(msg.username);
        avatar.textContent = msg.username.charAt(0).toUpperCase();
        row.appendChild(avatar);

        const body = document.createElement("div");
        body.className = "msg-body";

        const meta = document.createElement("div");
        meta.className = "msg-meta";
        const nameSpan = document.createElement("span");
        nameSpan.className = "msg-name";
        nameSpan.textContent = msg.username;
        meta.appendChild(nameSpan);
        const timeSpan = document.createElement("span");
        timeSpan.className = "msg-time";
        timeSpan.textContent = msg.time || "";
        meta.appendChild(timeSpan);
        body.appendChild(meta);

        const bubble = document.createElement("div");
        bubble.className = "msg-bubble";

        if (msg.text) {
            // Ban komutunu yakala (istemcide işleme)
            if (msg.text.startsWith("/ban ")) {
                const target = msg.text.substring(5).trim();
                if (target) {
                    socket.emit("ban_user", { username: target });
                }
                // Komut mesajını gösterme (isteğe bağlı)
                return;
            }
            const textNode = document.createTextNode(msg.text);
            bubble.appendChild(textNode);
        }

        if (msg.image) {
            const img = document.createElement("img");
            img.className = "msg-image";
            img.src = msg.image;
            img.alt = "Resim";
            img.loading = "lazy";
            img.addEventListener("click", () => window.open(msg.image, "_blank"));
            bubble.appendChild(img);
        }

        if (msg.video) {
            const video = document.createElement("video");
            video.className = "msg-video";
            video.src = msg.video;
            video.controls = true;
            video.preload = "metadata";
            video.addEventListener("click", () => {
                if (video.paused) video.play();
                else video.pause();
            });
            bubble.appendChild(video);
        }

        body.appendChild(bubble);
        row.appendChild(body);
        messagesEl.appendChild(row);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderSystemMessage(text) {
        const div = document.createElement("div");
        div.className = "system-msg";
        div.textContent = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function updateOnlineCount(count) {
        onlineCountEl.textContent = `${count} çevrimiçi`;
    }

    // --- KATILIM ---
    joinForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        if (!username) {
            joinError.textContent = "Lütfen bir kullanıcı adı girin.";
            joinError.classList.remove("hidden");
            return;
        }
        joinError.classList.add("hidden");

        socket = io();

        socket.on("connect", () => {
            socket.emit("join", { username });
        });

        socket.on("join_error", (data) => {
            joinError.textContent = data.message || "Giriş yapılamadı.";
            joinError.classList.remove("hidden");
        });

        socket.on("joined", (data) => {
            myUsername = data.username;
            if (data.history) data.history.forEach(msg => renderMessage(msg, msg.username === myUsername));
            updateOnlineCount(data.online_count);
            joinScreen.classList.add("hidden");
            chatScreen.classList.remove("hidden");
            messageInput.focus();
        });

        socket.on("user_joined", (data) => {
            renderSystemMessage(`📡 ${data.username} yayına katıldı.`);
            updateOnlineCount(data.online_count);
        });

        socket.on("user_left", (data) => {
            renderSystemMessage(`🔇 ${data.username} yayından ayrıldı.`);
            updateOnlineCount(data.online_count);
        });

        socket.on("user_list", (data) => {
            updateOnlineCount(data.users.length);
        });

        socket.on("new_message", (msg) => {
            const isOwn = (msg.username === myUsername);
            renderMessage(msg, isOwn);
        });

        socket.on("user_typing", (data) => {
            if (data.username !== myUsername) {
                typingText.textContent = `${data.username} yazıyor...`;
                typingIndicator.classList.remove("hidden");
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => typingIndicator.classList.add("hidden"), 3000);
            }
        });

        socket.on("user_stop_typing", () => {
            typingIndicator.classList.add("hidden");
        });

        socket.on("disconnect", () => {
            renderSystemMessage("⚠️ Bağlantı koptu, yeniden bağlanılıyor...");
        });

        socket.on("connect_error", (err) => {
            console.error("Bağlantı hatası:", err);
            joinError.textContent = "Sunucuya bağlanılamadı.";
            joinError.classList.remove("hidden");
        });
    });

    // --- MESAJ GÖNDERME ---
    function handleSend() {
        const text = messageInput.value.trim();
        let imageData = null;
        let videoData = null;

        // Resim varsa
        if (imageInput.files && imageInput.files.length > 0) {
            const file = imageInput.files[0];
            if (file.size > 25 * 1024 * 1024) {
                alert("Resim 25 MB'dan büyük olamaz.");
                imageInput.value = "";
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                imageData = e.target.result;
                // Video da varsa onu da işle
                if (videoInput.files && videoInput.files.length > 0) {
                    const vfile = videoInput.files[0];
                    if (vfile.size > 20 * 1024 * 1024) {
                        alert("Video 20 MB'dan büyük olamaz.");
                        videoInput.value = "";
                        return;
                    }
                    const vreader = new FileReader();
                    vreader.onload = function(ev) {
                        videoData = ev.target.result;
                        sendMessage(text, imageData, videoData);
                        messageInput.value = "";
                        imageInput.value = "";
                        videoInput.value = "";
                    };
                    vreader.readAsDataURL(vfile);
                } else {
                    sendMessage(text, imageData, null);
                    messageInput.value = "";
                    imageInput.value = "";
                    videoInput.value = "";
                }
            };
            reader.readAsDataURL(file);
            return;
        }

        // Sadece video varsa
        if (videoInput.files && videoInput.files.length > 0) {
            const file = videoInput.files[0];
            if (file.size > 20 * 1024 * 1024) {
                alert("Video 20 MB'dan büyük olamaz.");
                videoInput.value = "";
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                videoData = e.target.result;
                sendMessage(text, null, videoData);
                messageInput.value = "";
                imageInput.value = "";
                videoInput.value = "";
            };
            reader.readAsDataURL(file);
            return;
        }

        // Sadece metin
        sendMessage(text, null, null);
        messageInput.value = "";
        imageInput.value = "";
        videoInput.value = "";
    }

    sendBtn.addEventListener("click", handleSend);
    messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // --- Yazıyor ---
    let typingTimeout = null;
    messageInput.addEventListener("input", () => {
        if (socket && myUsername) {
            socket.emit("typing");
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => socket.emit("stop_typing"), 1000);
        }
    });

    // --- Butonlar ---
    imageBtn.addEventListener("click", () => imageInput.click());
    videoBtn.addEventListener("click", () => videoInput.click());

    console.log("Frekans sohbet başlatıldı. Video ve ban desteği aktif.");
});
