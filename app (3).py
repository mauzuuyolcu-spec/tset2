"""
Frekans - Basit, gercek zamanli mesajlasma sitesi
Resim paylasimi eklendi (base64 ile).
Render.com uyumlu (host=0.0.0.0, PORT ortam degiskeni)
"""

import os
import random
import base64
from datetime import datetime

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config["SECRET_KEY"] = "bu-anahtari-kendi-gizli-anahtarinizla-degistirin"

# CORS sorunlarını engellemek için
socketio = SocketIO(app, cors_allowed_origins="*")

# --- Bellekte tutulan veriler ---------------------------------------------
connected_users = {}      # { sid: username }
message_history = []      # son mesajlarin listesi
MAX_HISTORY = 50          # yeni katilan biri en fazla bu kadar eski mesaji gorur
MAX_IMAGE_SIZE = 1 * 1024 * 1024  # 1 MB (daha rahat)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def online_count():
    return len(connected_users)


# --- Sayfa rotasi -----------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# --- Socket.IO olaylari ------------------------------------------------------
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

    # Ayni isim zaten kullaniliyorsa sonuna numara ekle
    existing = set(connected_users.values())
    original, n = username, 2
    while username in existing:
        username = f"{original}{n}"
        n += 1

    connected_users[request.sid] = username

    # Sadece yeni katilan kisiye: hosgeldin bilgisi + mesaj gecmisi
    emit("joined", {
        "username": username,
        "history": message_history,
        "online_count": online_count(),
    })

    # Digerlerine: birisi katildi bildirimi
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

    text = (data or {}).get("text", "").strip()[:500]
    image_data = (data or {}).get("image", "").strip()

    # En azından metin veya resim olmalı
    if not text and not image_data:
        return

    # Resim varsa doğrula
    if image_data:
        try:
            # Geçerlilik kontrolü
            if not image_data.startswith("data:image/"):
                print("Geçersiz resim formatı (data:image ile başlamıyor)")
                return

            header, encoded = image_data.split(",", 1)
            mime_type = header.split(":")[1].split(";")[0]
            if mime_type not in ALLOWED_IMAGE_TYPES:
                print(f"İzin verilmeyen resim türü: {mime_type}")
                return

            # Boyut kontrolü (base64 uzunluğu)
            if len(encoded) > MAX_IMAGE_SIZE * 4 / 3:
                print("Resim çok büyük (max 1 MB)")
                return
        except Exception as e:
            print(f"Resim işleme hatası: {e}")
            return

    message = {
        "username": username,
        "text": text,
        "time": datetime.now().strftime("%H:%M"),
    }
    if image_data:
        message["image"] = image_data

    message_history.append(message)
    if len(message_history) > MAX_HISTORY:
        message_history.pop(0)

    emit("new_message", message, broadcast=True)
    print(f"Mesaj gönderildi: {username} - {text[:20]}...")


@socketio.on("typing")
def handle_typing(_data):
    username = connected_users.get(request.sid)
    if username:
        emit("user_typing", {"username": username}, broadcast=True, include_self=False)


@socketio.on("stop_typing")
def handle_stop_typing(_data):
    username = connected_users.get(request.sid)
    if username:
        emit("user_stop_typing", {"username": username}, broadcast=True, include_self=False)


# --- Bu kısım Render (production) için çok önemli! ---
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, debug=False, host="0.0.0.0", port=port)
