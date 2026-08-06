document.addEventListener("DOMContentLoaded", () => {

  const joinScreen = document.getElementById("join-screen");
  const chatScreen = document.getElementById("chat-screen");
  const joinForm = document.getElementById("join-form");
  const usernameInput = document.getElementById("username-input");
  const joinError = document.getElementById("join-error");
  const messagesEl = document.getElementById("messages");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const fileBtn = document.getElementById("file-btn");
  const fileInput = document.getElementById("file-input");
  const onlineCountEl = document.getElementById("online-count");
  const typingIndicator = document.getElementById("typing-indicator");
  const typingText = document.getElementById("typing-text");
  const userListEl = document.getElementById("user-list");
  const dmInfo = document.getElementById("dm-info");
  const dmTargetName = document.getElementById("dm-target-name");
  const dmCancelBtn = document.getElementById("dm-cancel-btn");
  const adminBtn = document.getElementById("admin-btn");

  let socket = null;
  let myUsername = "";
  let typingTimer = null;
  let dmTarget = null;
  let isAdmin = false; // İstemci tarafı yetki

  // Renk
  function getUserColor(name) {
    const colors = ["var(--u1)","var(--u2)","var(--u3)","var(--u4)","var(--u5)","var(--u6)","var(--u7)","var(--u8)"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  // Mesaj gönderme (DM desteği)
  function sendMessage(text, fileData, fileType) {
    if (!socket) return;
    if (!text && !fileData) return;
    const payload = { text };
    if (fileData && fileType === "image") payload.image = fileData;
    if (fileData && fileType === "video") payload.video = fileData;
    if (dmTarget) payload.to = dmTarget;
    socket.emit("send_message", payload);
  }

  // Mesaj render
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
    if (msg.is_dm) {
      const dmLabel = document.createElement("span");
      dmLabel.className = "dm-label";
      dmLabel.textContent = "🔒 Özel";
      meta.appendChild(dmLabel);
    }
    body.appendChild(meta);

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    if (msg.text) {
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

  // Kullanıcı listesini güncelle
  function updateUserList(users) {
    userListEl.innerHTML = "";
    users.forEach(username => {
      const li = document.createElement("li");
      li.className = "user-item";

      const avatar = document.createElement("span");
      avatar.className = "user-avatar";
      avatar.style.background = getUserColor(username);
      avatar.textContent = username.charAt(0).toUpperCase();
      li.appendChild(avatar);

      const nameSpan = document.createElement("span");
      nameSpan.className = "user-name";
      nameSpan.textContent = username;
      li.appendChild(nameSpan);

      if (username !== myUsername) {
        // DM butonu (her zaman göster)
        const dmBtn = document.createElement("button");
        dmBtn.className = "user-dm-btn";
        dmBtn.textContent = "💬";
        dmBtn.title = "Özel mesaj gönder";
        dmBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          startDM(username);
        });
        li.appendChild(dmBtn);

        // Ban butonu – sadece admin ise göster
        if (isAdmin) {
          const banBtn = document.createElement("button");
          banBtn.className = "user-ban-btn";
          banBtn.textContent = "🚫";
          banBtn.title = "Bu kullanıcıyı banla (1 saat)";
          banBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`${username} kullanıcısını 1 saatliğine banlamak istediğine emin misin?`)) {
              socket.emit("ban_user", { username });
            }
          });
          li.appendChild(banBtn);
        }
      } else {
        const meSpan = document.createElement("span");
        meSpan.className = "user-me";
        meSpan.textContent = "(sen)";
        li.appendChild(meSpan);
      }

      userListEl.appendChild(li);
    });
  }

  // DM modu
  function startDM(username) {
    dmTarget = username;
    dmTargetName.textContent = username;
    dmInfo.classList.remove("hidden");
    messageInput.placeholder = `@${username} için özel mesaj...`;
    messageInput.focus();
  }

  function cancelDM() {
    dmTarget = null;
    dmInfo.classList.add("hidden");
    messageInput.placeholder = "Mesaj yaz, dosya ekle...";
  }

  // --- Admin yetkisi alma ---
  adminBtn.addEventListener("click", () => {
    if (isAdmin) {
      // Zaten admin ise bilgi ver
      renderSystemMessage("✅ Zaten admin yetkisine sahipsiniz.");
      return;
    }
    const code = prompt("Admin kodunu girin:");
    if (code === null) return; // iptal
    if (code.trim() === "") {
      renderSystemMessage("❌ Kod boş olamaz.");
      return;
    }
    socket.emit("admin_auth", { code: code.trim() });
  });

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
      joinError.textContent = data.message;
      joinError.classList.remove("hidden");
      socket.disconnect();
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
      updateUserList(data.users);
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

    // Admin doğrulama cevabı
    socket.on("admin_approved", (data) => {
      if (data.status) {
        isAdmin = true;
        adminBtn.classList.add("active");
        renderSystemMessage("✅ Admin yetkisi alındı! Artık kullanıcıları banlayabilirsiniz.");
        // Listeyi yenile (ban butonlarını göstermek için)
        // Mevcut listeyi yeniden renderla
        const currentUsers = Array.from(userListEl.querySelectorAll(".user-name")).map(el => el.textContent);
        if (currentUsers.length) updateUserList(currentUsers);
        // Aslında user_list event'i zaten gelir ama güvenlik için
        socket.emit("get_user_list"); // opsiyonel, ama biz zaten user_list'i alıyoruz
      } else {
        renderSystemMessage(`❌ ${data.message || "Geçersiz kod."}`);
      }
    });

    // Sunucudan user_list tekrar gelsin diye (admin olduktan sonra)
    // Ama her değişiklikte zaten geliyor.

    socket.on("disconnect", () => renderSystemMessage("⚠️ Bağlantı koptu, yeniden bağlanılıyor..."));
  });

  // --- MESAJ GÖNDERME ---
  function handleSend() {
    const text = messageInput.value.trim();
    let fileData = null;
    let fileType = null;

    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = function(e) {
        fileData = e.target.result;
        if (file.type.startsWith("image/")) fileType = "image";
        else if (file.type.startsWith("video/")) fileType = "video";
        else {
          alert("Sadece resim veya video dosyası seçin.");
          fileInput.value = "";
          return;
        }
        sendMessage(text, fileData, fileType);
        messageInput.value = "";
        fileInput.value = "";
        cancelDM();
      };
      reader.readAsDataURL(file);
      return;
    }

    sendMessage(text, null, null);
    messageInput.value = "";
    fileInput.value = "";
    cancelDM();
  }

  sendBtn.addEventListener("click", handleSend);
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // --- TYPING ---
  let typingTimeout = null;
  messageInput.addEventListener("input", () => {
    if (socket && myUsername) {
      socket.emit("typing");
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => socket.emit("stop_typing"), 1000);
    }
  });

  // --- DOSYA SEÇ ---
  fileBtn.addEventListener("click", () => fileInput.click());

  // --- DM İPTAL ---
  dmCancelBtn.addEventListener("click", cancelDM);

  console.log("Frekans video, ban ve DM sistemi aktif!");
});
