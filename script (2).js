document.addEventListener("DOMContentLoaded", () => {

  // DOM elemanları
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
  const onlineCountEl = document.getElementById("online-count");
  const typingIndicator = document.getElementById("typing-indicator");
  const typingText = document.getElementById("typing-text");

  let socket = null;
  let myUsername = "";
  let typingTimer = null;

  // Kullanıcı adı için renk (hash ile)
  function getUserColor(name) {
    const colors = [
      "var(--u1)", "var(--u2)", "var(--u3)", "var(--u4)",
      "var(--u5)", "var(--u6)", "var(--u7)", "var(--u8)"
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // Mesaj gönderme
  function sendMessage(text, imageData) {
    if (!socket) {
      console.error("Socket bağlı değil");
      return;
    }
    if (!text && !imageData) {
      console.warn("Boş mesaj gönderilmeye çalışıldı");
      return;
    }
    const payload = { text, image: imageData || "" };
    console.log("Gönderiliyor:", payload);
    socket.emit("send_message", payload);
  }

  // Mesaj listesine ekleme
  function renderMessage(msg, isOwn = false) {
    const row = document.createElement("div");
    row.className = `msg-row${isOwn ? " own" : ""}`;

    // Avatar
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.background = getUserColor(msg.username);
    avatar.textContent = msg.username.charAt(0).toUpperCase();
    row.appendChild(avatar);

    // Gövde
    const body = document.createElement("div");
    body.className = "msg-body";

    // Meta (isim + saat)
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

    // Balon
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    // Metin varsa
    if (msg.text) {
      const textNode = document.createTextNode(msg.text);
      bubble.appendChild(textNode);
    }

    // Resim varsa
    if (msg.image) {
      const img = document.createElement("img");
      img.className = "msg-image";
      img.src = msg.image;
      img.alt = "Paylaşılan resim";
      img.loading = "lazy";
      // tıklanınca tam boyutta aç
      img.addEventListener("click", () => {
        window.open(msg.image, "_blank");
      });
      bubble.appendChild(img);
    }

    body.appendChild(bubble);
    row.appendChild(body);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Sistem mesajı
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

  // --- Katılım formu ---
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

    socket.on("joined", (data) => {
      myUsername = data.username;
      if (data.history && data.history.length) {
        data.history.forEach(msg => {
          const isOwn = (msg.username === myUsername);
          renderMessage(msg, isOwn);
        });
      }
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
        typingTimer = setTimeout(() => {
          typingIndicator.classList.add("hidden");
        }, 3000);
      }
    });

    socket.on("user_stop_typing", (data) => {
      if (data.username !== myUsername) {
        typingIndicator.classList.add("hidden");
      }
    });

    socket.on("disconnect", () => {
      renderSystemMessage("⚠️ Bağlantı koptu, yeniden bağlanılıyor...");
    });

    socket.on("connect_error", (err) => {
      console.error("Socket bağlantı hatası:", err);
      joinError.textContent = "Sunucuya bağlanılamadı. Lütfen daha sonra tekrar dene.";
      joinError.classList.remove("hidden");
    });
  });

  // --- Mesaj gönderme ---
  function handleSend() {
    const text = messageInput.value.trim();
    let imageData = null;

    // Eğer imageInput'da dosya varsa oku
    if (imageInput.files && imageInput.files.length > 0) {
      const file = imageInput.files[0];
      if (!file.type.startsWith("image/")) {
        alert("Lütfen geçerli bir resim dosyası seçin.");
        imageInput.value = "";
        return;
      }
      if (file.size > 1 * 1024 * 1024) {
        alert("Resim boyutu 1 MB'ı geçemez.");
        imageInput.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = function(e) {
        imageData = e.target.result; // base64
        // Gönder
        sendMessage(text, imageData);
        messageInput.value = "";
        imageInput.value = "";
      };
      reader.onerror = function(e) {
        alert("Resim okunamadı, lütfen tekrar deneyin.");
        imageInput.value = "";
      };
      reader.readAsDataURL(file);
      return; // asenkron, callback'te gönderecek
    }

    // Resim yoksa direkt metni gönder
    sendMessage(text, null);
    messageInput.value = "";
    imageInput.value = "";
  }

  sendBtn.addEventListener("click", handleSend);

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // --- Yazıyor bildirimi ---
  let typingTimeout = null;
  messageInput.addEventListener("input", () => {
    if (socket && myUsername) {
      socket.emit("typing");
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit("stop_typing");
      }, 1000);
    }
  });

  // --- Resim seçme butonu ---
  imageBtn.addEventListener("click", () => {
    imageInput.click();
  });

  console.log("Frekans sohbet başlatıldı. Resim paylaşımı aktif!");
});
