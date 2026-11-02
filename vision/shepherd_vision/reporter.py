"""Sonuçları siteye (Supabase) gönderir. Video asla gönderilmez, yalnızca sayılar ve olaylar gider.

İnternet kesilirse kayıtlar yerel bir SQLite kuyruğunda bekler ve bağlantı gelince sırayla
gönderilir; elektrik/servis yeniden başlasa da kaybolmaz. Canlı konum ise kuyruğa girmez:
geç gelen canlı konumun anlamı yoktur, yalnızca en sonuncusu gönderilir.

Supabase girişi sitedeki hesabınızla (e-posta + şifre) yapılır. Satır güvenliği (RLS)
sayesinde servis yalnızca o hesabın tablolarına yazabilir; servis anahtarı gerekmez.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Dict, Optional

import requests

log = logging.getLogger(__name__)

TABLES = ("vision_zone_visits", "vision_zone_counts", "vision_alerts")


class FileReporter:
    """Supabase ayarlanmadan önce deneme için: her kaydı bir JSONL dosyasına yazar."""

    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def record(self, table: str, row: dict) -> None:
        with self._lock, self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"table": table, **row}, ensure_ascii=False) + "\n")

    def live(self, camera_id: str, payload: dict) -> None:
        pass

    def flush(self) -> None:
        pass

    def close(self) -> None:
        pass


class SupabaseReporter:
    def __init__(self, url: str, key: str, email: str, password: str, queue_path: str, timeout_s: float = 15.0):
        if not (url and key and email and password):
            raise ValueError("Supabase için url, key, email ve password gerekli.")
        self.url = url.rstrip("/")
        self.key = key
        self.email = email
        self.password = password
        self.timeout_s = timeout_s
        self.session = requests.Session()
        self._token: Optional[str] = None
        self._refresh: Optional[str] = None
        self._expires_at = 0.0
        self.user_id: Optional[str] = None
        self._login_retry_at = 0.0  # yanlış şifrede Supabase'i her 5 sn'de yormamak için
        self._login_backoff = 30.0
        self._auth_lock = threading.Lock()
        self._db_lock = threading.Lock()
        Path(queue_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(queue_path, check_same_thread=False)
        self._db.execute(
            "create table if not exists outbox (id integer primary key autoincrement, tbl text not null, row text not null)"
        )
        self._db.commit()

    # ── Kimlik doğrulama ──
    def _auth(self, grant: str, body: dict) -> bool:
        try:
            r = self.session.post(
                f"{self.url}/auth/v1/token?grant_type={grant}",
                headers={"apikey": self.key, "Content-Type": "application/json"},
                json=body,
                timeout=self.timeout_s,
            )
        except requests.RequestException as exc:
            log.warning("Supabase'e ulaşılamadı (%s). Kayıtlar kuyrukta bekleyecek.", exc.__class__.__name__)
            return False
        if r.status_code != 200:
            if grant == "password":
                log.error("Supabase girişi başarısız (%s): %s", r.status_code, r.text[:200])
            return False
        data = r.json()
        self._token = data["access_token"]
        self._refresh = data.get("refresh_token")
        self._expires_at = time.time() + float(data.get("expires_in", 3600))
        self.user_id = (data.get("user") or {}).get("id")
        return True

    def _ensure_token(self) -> bool:
        with self._auth_lock:
            if self._token and time.time() < self._expires_at - 120:
                return True
            if self._refresh and self._auth("refresh_token", {"refresh_token": self._refresh}):
                return True
            if time.time() < self._login_retry_at:
                return False
            if self._auth("password", {"email": self.email, "password": self.password}):
                self._login_backoff = 30.0
                return True
            self._login_retry_at = time.time() + self._login_backoff
            self._login_backoff = min(self._login_backoff * 2, 900.0)
            return False

    def _headers(self, prefer: str) -> Dict[str, str]:
        return {
            "apikey": self.key,
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        }

    # ── Gönderim ──
    def record(self, table: str, row: dict) -> None:
        if table not in TABLES:
            raise ValueError(f"Bilinmeyen tablo: {table}")
        with self._db_lock:
            self._db.execute("insert into outbox (tbl, row) values (?, ?)", (table, json.dumps(row, ensure_ascii=False)))
            self._db.commit()

    def live(self, camera_id: str, payload: dict) -> None:
        if not self._ensure_token() or not self.user_id:
            return
        row = {"owner_id": self.user_id, "camera_id": camera_id, **payload}
        try:
            r = self.session.post(
                f"{self.url}/rest/v1/vision_live?on_conflict=owner_id,camera_id",
                headers=self._headers("resolution=merge-duplicates,return=minimal"),
                data=json.dumps(row),
                timeout=self.timeout_s,
            )
            if r.status_code == 401:
                self._token = None
            elif r.status_code >= 300:
                log.warning("Canlı konum gönderilemedi (%s): %s", r.status_code, r.text[:200])
        except requests.RequestException:
            pass  # bir sonraki canlı konum zaten gelecek

    def flush(self, batch_size: int = 200) -> int:
        """Kuyruktaki kayıtları gönderir; gönderilen kayıt sayısını döndürür."""
        sent = 0
        for table in TABLES:
            while True:
                with self._db_lock:
                    rows = self._db.execute(
                        "select id, row from outbox where tbl = ? order by id limit ?", (table, batch_size)
                    ).fetchall()
                if not rows:
                    break
                if not self._ensure_token():
                    return sent
                try:
                    r = self.session.post(
                        f"{self.url}/rest/v1/{table}",
                        headers=self._headers("return=minimal"),
                        data="[" + ",".join(row for _, row in rows) + "]",
                        timeout=self.timeout_s,
                    )
                except requests.RequestException:
                    return sent  # ağ yok; kayıtlar kuyrukta kalır
                if r.status_code == 401:
                    self._token = None
                    return sent
                if r.status_code >= 500 or r.status_code == 429:
                    return sent
                if r.status_code >= 300:
                    # Şema kurulmamış (404) gibi kalıcı bir hata: veriyi silmeden durur, kullanıcıya söyler.
                    log.error(
                        "'%s' tablosuna yazılamadı (%s): %s — data/schema.sql çalıştırıldı mı?",
                        table, r.status_code, r.text[:200],
                    )
                    return sent
                ids = [row_id for row_id, _ in rows]
                with self._db_lock:
                    self._db.execute(f"delete from outbox where id in ({','.join('?' * len(ids))})", ids)
                    self._db.commit()
                sent += len(rows)
        return sent

    def pending(self) -> int:
        with self._db_lock:
            return int(self._db.execute("select count(*) from outbox").fetchone()[0])

    def close(self) -> None:
        self.flush()
        with self._db_lock:
            self._db.close()


def build_reporter(cfg: dict, base_dir: Path):
    sb = cfg.get("supabase") or {}
    if sb.get("enabled"):
        return SupabaseReporter(
            url=sb.get("url", ""),
            key=sb.get("key", ""),
            email=sb.get("email", ""),
            password=sb.get("password", ""),
            queue_path=str(base_dir / sb.get("queue_file", "output/outbox.sqlite3")),
        )
    path = base_dir / (cfg.get("output", {}) or {}).get("events_file", "output/events.jsonl")
    log.info("Supabase kapalı: kayıtlar %s dosyasına yazılacak.", path)
    return FileReporter(str(path))
