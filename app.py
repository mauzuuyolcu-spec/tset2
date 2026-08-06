"""
Frekans - Gerçek zamanlı sohbet + Resim/Video paylaşımı + Ban sistemi
"""

import os
import random
import base64
from datetime import datetime, timedelta

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config["SECRET_KEY"] = "değiştir-bunu"

# Socket.IO ayarları - mesaj boyutunu artır (50 MB'a kadar)
socketio = SocketIO(app, max_http_buffer_size=50 * 1024 * 1024)

# --- Bellekte tutulan veriler ---------------------------------------------
connected_users = {}      # { sid: username }
message_history = []      # son mesajlar
MAX_HISTORY = 50

# Dosya limitleri
MAX_IMAGE_SIZE = 25 * 1024 * 1024   # 25 MB
MAX_VIDEO_SIZE = 20 * 1024 * 1024   # 20 MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/ogg"}

# Ban sistemi: { kullanıcı_adı: bitiş_zamanı }
banned_users = {}


def online_count():
    return len(connected_users)


def is_banned(username):
    if username in banned_users:
        if datetime.now() < banned_users[username]:
            return True
        else:
            del banned_users[username]  # süresi doldu, temizle
    return False


# --- Sayfa rotası -----------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# --- Socket.IO --------------------------------------------------------------
@socketio.on("connect")
def handle_connect():
    print(f"Yeni bağlantı: {request.sid}")


@socketio.on("disconnect")
def handle_disconnect():
    username = connected_users.pop(request.sid, None)
    if username:
        emit("user_left", {"username": username, "online_count": online_count()}, broadcast=True)
        emit("user_list", {"users": list(connected_users.values())}, broadcast=True)


@socketio.on("join")
def handle_join(data):
    username = (data or {}).get("username", "").strip()[:20]
    if not username:
        username = f"Misafir{random.randint(1000, 9999)}"

    # Ban kontrolü
    if is_banned(username):
        emit("join_error", {"message": "Bu kullanıcı adı 1 saatliğine yasaklanmıştır."})
        return

    # Aynı isim kontrolü
    existing = set(connected_users.values())
    original, n = username, 2
    while username in existing:
        username = f"{original}{n}"
        n += 1

    connected_users[request.sid] = username

    emit("joined", {
        "username": username,
        "history": message_history,
        "online_count": online_count(),
    })

    emit("user_joined", {
        "username": username,
        "online_count": online_count(),
    }, broadcast=True, include_self=False)

    emit("user_list", {"users": list(connected_users.values())}, broadcast=True)


@socketio.on("send_message")
def handle_send_message(data):
    username = connected_users.get(request.sid)
    if not username:
        return

    # Ban kontrolü
    if is_banned(username):
        emit("new_message", {
            "username": "Sistem",
            "text": "❌ Yasaklandınız, mesaj gönderemezsiniz.",
            "time": datetime.now().strftime("%H:%M")
        })
        return

    text = (data or {}).get("text", "").strip()[:500]
    image_data = (data or {}).get("image", "").strip()
    video_data = (data or {}).get("video", "").strip()

    if not text and not image_data and not video_data:
        return

    # Resim doğrulama
    if image_data:
        try:
            header, encoded = image_data.split(",", 1)
            mime_type = header.split(":")[1].split(";")[0]
            if mime_type not in ALLOWED_IMAGE_TYPES:
                return
            if len(encoded) > MAX_IMAGE_SIZE * 4 / 3:
                return
        except Exception:
            return

    # Video doğrulama
    if video_data:
        try:
            header, encoded = video_data.split(",", 1)
            mime_type = header.split(":")[1].split(";")[0]
            if mime_type not in ALLOWED_VIDEO_TYPES:
                return
            if len(encoded) > MAX_VIDEO_SIZE * 4 / 3:
                return
        except Exception:
            return

    message = {
        "username": username,
        "text": text,
        "time": datetime.now().strftime("%H:%M"),
    }
    if image_data:
        message["image"] = image_data
    if video_data:
        message["video"] = video_data

    message_history.append(message)
    if len(message_history) > MAX_HISTORY:
        message_history.pop(0)

    emit("new_message", message, broadcast=True)


@socketio.on("typing")
def handle_typing(_data):
    username = connected_users.get(request.sid)
    if username and not is_banned(username):
        emit("user_typing", {"username": username}, broadcast=True, include_self=False)


@socketio.on("stop_typing")
def handle_stop_typing(_data):
    username = connected_users.get(request.sid)
    if username:
        emit("user_stop_typing", {"username": username}, broadcast=True, include_self=False)


# --- Ban komutu (istemciden gelecek) ---
@socketio.on("ban_user")
def handle_ban_user(data):
    # Sadece yetkili kişiler ban atabilir (şimdilik herkes ban atabilir, ama kontrol eklenebilir)
    # Bu örnekte herkes "/ban kullanıcı" yazabilir.
    admin_username = connected_users.get(request.sid)
    if not admin_username:
        return

    target_username = (data or {}).get("username", "").strip()
    if not target_username:
        return

    # Kendini banlayamaz
    if target_username == admin_username:
        emit("new_message", {
            "username": "Sistem",
            "text": "❌ Kendini banlayamazsın!",
            "time": datetime.now().strftime("%H:%M")
        })
        return

    # Ban süresi 1 saat
    banned_users[target_username] = datetime.now() + timedelta(hours=1)

    # Banlanan kişiyi odadan at (eğer bağlıysa)
    for sid, uname in list(connected_users.items()):
        if uname == target_username:
            # Socket bağlantısını kes
            socketio.disconnect(sid, namespace="/")
            # connected_users'dan sil
            del connected_users[sid]
            # Herkese duyur
            emit("user_left", {"username": target_username, "online_count": online_count()}, broadcast=True)
            emit("user_list", {"users": list(connected_users.values())}, broadcast=True)
            break

    # Sistem mesajı olarak duyur
    emit("new_message", {
        "username": "Sistem",
        "text": f"🔨 {target_username} 1 saatliğine yasaklandı!",
        "time": datetime.now().strftime("%H:%M")
    }, broadcast=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, debug=False, host="0.0.0.0", port=port)
