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
  let isAdmin = false;

  function getUserColor(name) {
    const colors = ["var(--u1)","var(--u2)","var(--u3)","var(--u4)","var(--u5)","var(--u6)","var(--u7)","var(--u8)"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  function sendMessage(text, fileData, fileType) {
    if (!socket) return;
    if (!text && !fileData) return;
    const payload = { text };
    if (fileData && fileType === "image") payload.image = fileData;
    if (fileData && fileType === "video") payload.video = fileData;
    if (dmTarget) payload.to = dmTarget;
    socket.emit("send_message", payload);
  }

  // Mesaj render (silme butonu eklendi)
  function renderMessage(msg, isOwn = false) {
    const row = document.createElement("div");
    row.className = `msg-row${isOwn ? " own" : ""}`;
    // Mesaj ID'sini data attribute olarak ekle
    if (msg.id) row.dataset.messageId = msg.id;

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

    // Admin ise ve mesaj DM değilse silme butonu ekle
    if (isAdmin && !msg.is_dm) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "msg-delete-btn";
      deleteBtn.textContent = "🗑️";
      deleteBtn.title = "Mesajı sil";
      deleteBtn.style.background = "transparent";
      deleteBtn.style.border = "none";
      deleteBtn.style.color = "var(--text-muted)";
      deleteBtn.style.cursor = "pointer";
      deleteBtn.style.marginTop = "4px";
      deleteBtn.style.fontSize = "12px";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Bu mesajı silmek istediğine emin misin?")) {
          if (msg.id) {
            socket.emit("delete_message", { message_id: msg.id });
          }
        }
      });
      body.appendChild(deleteBtn);
    }

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
        const dmBtn = document.createElement("button");
        dmBtn.className = "user-dm-btn";
        dmBtn.textContent = "💬";
        dmBtn.title = "Özel mesaj gönder";
        dmBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          startDM(username);
        });
        li.appendChild(dmBtn);

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

  adminBtn.addEventListener("click", () => {
    if (isAdmin) {
      renderSystemMessage("✅ Zaten admin yetkisine sahipsiniz.");
      return;
    }
    const code = prompt("Admin kodunu girin:");
    if (code === null) return;
    if (code.trim() === "") {
      renderSystemMessage("❌ Kod boş olamaz.");
      return;
    }
    socket.emit("admin_auth", { code: code.trim() });
  });

  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (!username) {
      joinError.textContent = "Lütfen bir kullanıcı adı girin.";
      joinError.classList.remove("hidden");
      return;
    }
    joinError.classList.add("hidden");

    socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

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

    socket.on("admin_approved", (data) => {
      if (data.status) {
        isAdmin = true;
        adminBtn.classList.add("active");
        renderSystemMessage("✅ Admin yetkisi alındı! Artık kullanıcıları banlayabilir ve mesajları silebilirsiniz.");
        // Listeyi yenile (ban butonları için)
        // Mevcut mesajlara silme butonu eklemek için tüm mesajları yeniden render etmek yerine,
        // mesajları tekrar render etmek gerekir. Bunun için history'yi yeniden isteyebiliriz veya
        // mevcut mesajların üzerine silme butonlarını ekleyebiliriz.
        // Pratik çözüm: sayfayı yenilemek? Ama bu kullanıcı deneyimini bozar.
        // En iyisi: mevcut mesajları dolaşıp her birine silme butonu eklemek.
        document.querySelectorAll('.msg-row').forEach(row => {
          // Eğer zaten silme butonu varsa ekleme
          if (!row.querySelector('.msg-delete-btn')) {
            const msgId = row.dataset.messageId;
            if (msgId) {
              const isDm = row.querySelector('.dm-label') !== null;
              if (!isDm) {
                const body = row.querySelector('.msg-body');
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'msg-delete-btn';
                deleteBtn.textContent = '🗑️';
                deleteBtn.title = 'Mesajı sil';
                deleteBtn.style.background = 'transparent';
                deleteBtn.style.border = 'none';
                deleteBtn.style.color = 'var(--text-muted)';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.marginTop = '4px';
                deleteBtn.style.fontSize = '12px';
                deleteBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  if (confirm('Bu mesajı silmek istediğine emin misin?')) {
                    socket.emit('delete_message', { message_id: msgId });
                  }
                });
                body.appendChild(deleteBtn);
              }
            }
          }
        });
      } else {
        renderSystemMessage(`❌ ${data.message || "Geçersiz kod."}`);
      }
    });

    // Mesaj silme event'i
    socket.on("message_deleted", (data) => {
      const msgId = data.message_id;
      const row = document.querySelector(`.msg-row[data-message-id="${msgId}"]`);
      if (row) {
        row.remove();
        renderSystemMessage(`🗑️ Bir mesaj silindi.`);
      }
    });

    socket.on("disconnect", () => {
      renderSystemMessage("⚠️ Bağlantı kesildi, yeniden bağlanmaya çalışılıyor...");
    });

    socket.on("reconnect", (attempt) => {
      renderSystemMessage(`✅ Bağlantı yeniden kuruldu (deneme ${attempt}).`);
    });

    socket.on("reconnect_error", (err) => {
      renderSystemMessage(`⚠️ Yeniden bağlanma hatası: ${err.message}`);
    });

    socket.on("reconnect_failed", () => {
      renderSystemMessage("❌ Yeniden bağlanma başarısız, sayfayı yenileyin.");
    });
  });

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

  let typingTimeout = null;
  messageInput.addEventListener("input", () => {
    if (socket && myUsername) {
      socket.emit("typing");
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => socket.emit("stop_typing"), 1000);
    }
  });

  fileBtn.addEventListener("click", () => fileInput.click());
  dmCancelBtn.addEventListener("click", cancelDM);

  console.log("Frekans video, ban ve DM sistemi aktif!");
});
