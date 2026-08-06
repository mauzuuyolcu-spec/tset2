"""
Frekans - Video & Resim Paylaşımlı, Ban Sistemi, Özel Mesaj (DM)
"""

import os
import random
import time
from datetime import datetime, timedelta

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config["SECRET_KEY"] = "bu-anahtari-degistir"

socketio = SocketIO(app, cors_allowed_origins="*")

# --- Bellekteki veriler ---
connected_users = {}        # { sid: username }
message_history = []        # son 50 mesaj
banned_users = {}           # { username: ban_bitis_zamani (timestamp) }

MAX_HISTORY = 50
MAX_IMAGE_SIZE = 25 * 1024 * 1024   # 25 MB
MAX_VIDEO_SIZE = 20 * 1024 * 1024   # 20 MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/ogg"}

BAN_DURATION = 3600  # 1 saat (saniye)

def online_count():
    return len(connected_users)

def is_banned(username):
    if username in banned_users:
        if time.time() < banned_users[username]:
            return True
        else:
            del banned_users[username]
    return False

@app.route("/")
def index():
    return render_template("index.html")

# --- Socket.IO ---
@socketio.on("connect")
def handle_connect():
    print(f"Yeni baglanti: {request.sid}")

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

    if is_banned(username):
        emit("join_error", {"message": "Bu kullanıcı 1 saatliğine yasaklanmıştır."})
        return

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

# --- BAN OLAYI (butondan gelen) ---
@socketio.on("ban_user")
def handle_ban_user(data):
    admin_username = connected_users.get(request.sid)
    if not admin_username:
        return

    target = (data or {}).get("username", "").strip()
    if not target:
        return

    # Kendini banlayamaz
    if target == admin_username:
        emit("new_message", {
            "username": "Sistem",
            "text": "❌ Kendini banlayamazsın.",
            "time": datetime.now().strftime("%H:%M")
        })
        return

    if target not in connected_users.values():
        emit("new_message", {
            "username": "Sistem",
            "text": f"❌ {target} çevrimiçi değil.",
            "time": datetime.now().strftime("%H:%M")
        })
        return

    # Banla
    banned_users[target] = time.time() + BAN_DURATION

    # Herkese duyur
    emit("new_message", {
        "username": "Sistem",
        "text": f"🚫 {target} 1 saatliğine banlandı.",
        "time": datetime.now().strftime("%H:%M")
    }, broadcast=True)

    # Banlanan kişiyi odadan at
    for sid, uname in list(connected_users.items()):
        if uname == target:
            connected_users.pop(sid, None)
            emit("user_left", {"username": target, "online_count": online_count()}, broadcast=True)
            break

    # Listeyi güncelle
    emit("user_list", {"users": list(connected_users.values())}, broadcast=True)

# --- MESAJ GÖNDERME (DM desteği) ---
@socketio.on("send_message")
def handle_send_message(data):
    sender = connected_users.get(request.sid)
    if not sender:
        return

    if is_banned(sender):
        emit("new_message", {
            "username": "Sistem",
            "text": "❌ Bu hesap 1 saatliğine banlanmıştır.",
            "time": datetime.now().strftime("%H:%M")
        })
        return

    text = (data or {}).get("text", "").strip()[:500]
    image_data = (data or {}).get("image", "").strip()
    video_data = (data or {}).get("video", "").strip()
    to_user = (data or {}).get("to", "").strip()  # Özel mesaj hedefi

    # Sadece metin, resim veya video olabilir
    if not text and not image_data and not video_data:
        return

    # Resim / video doğrulama (önceki gibi)
    if image_data:
        try:
            header, encoded = image_data.split(",", 1)
            mime_type = header.split(":")[1].split(";")[0]
            if mime_type not in ALLOWED_IMAGE_TYPES or len(encoded) > MAX_IMAGE_SIZE * 4 / 3:
                return
        except:
            return

    if video_data:
        try:
            header, encoded = video_data.split(",", 1)
            mime_type = header.split(":")[1].split(";")[0]
            if mime_type not in ALLOWED_VIDEO_TYPES or len(encoded) > MAX_VIDEO_SIZE * 4 / 3:
                return
        except:
            return

    message = {
        "username": sender,
        "text": text,
        "time": datetime.now().strftime("%H:%M"),
        "is_dm": False  # varsayılan
    }
    if image_data:
        message["image"] = image_data
    if video_data:
        message["video"] = video_data

    # Özel mesaj mı?
    if to_user and to_user in connected_users.values():
        message["is_dm"] = True
        message["to"] = to_user
        # Göndericiye ve alıcıya gönder, diğerlerine değil
        # Alıcının sid'sini bul
        recipient_sid = None
        for sid, uname in connected_users.items():
            if uname == to_user:
                recipient_sid = sid
                break
        if recipient_sid:
            # Göndericiye (kendine) gönder
            emit("new_message", message, room=request.sid)
            # Alıcıya gönder
            emit("new_message", message, room=recipient_sid)
            # Geçmişe ekle (isteğe bağlı, ama DM'leri de saklayabiliriz)
            message_history.append(message)
            if len(message_history) > MAX_HISTORY:
                message_history.pop(0)
            return  # broadcast yapma, sadece iki kişiye gitti

    # Herkese açık mesaj
    message_history.append(message)
    if len(message_history) > MAX_HISTORY:
        message_history.pop(0)
    emit("new_message", message, broadcast=True)

# --- TYPING (DM'de de çalışsın ama basit olsun, herkese yayın) ---
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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, debug=False, host="0.0.0.0", port=port)
