"""Kamera akışını arka planda okur; her zaman en son kareyi hazır tutar.

RTSP yayınları okunmadıkça birikir ve görüntü dakikalarca geride kalır. Bu sınıf akışı
sürekli boşaltır, model ise kendi hızında (saniyede 1–2 kare) en yeni kareyi alır.
Bağlantı koparsa artan bekleme süreleriyle yeniden bağlanır.
Video dosyası verilirse gerçek zamanlı hızda oynatılır (deneme için).
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Optional, Tuple

# RTSP'de UDP paket kaybı görüntüyü bozar; TCP daha kararlıdır.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")

import cv2  # noqa: E402

log = logging.getLogger(__name__)


def is_file_source(source: str) -> bool:
    return not source.isdigit() and "://" not in source


def open_capture(source: str):
    return cv2.VideoCapture(int(source) if source.isdigit() else source)


class CameraStream:
    def __init__(self, camera_id: str, source: str):
        self.camera_id = camera_id
        self.source = source
        self.is_file = is_file_source(source)
        self.finished = False  # yalnızca video dosyası sona erdiğinde
        self.connected = False
        self._frame = None
        self._frame_ts: Optional[float] = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"camera-{camera_id}", daemon=True)

    def start(self) -> "CameraStream":
        if self.is_file and not os.path.exists(self.source):
            raise FileNotFoundError(f"[{self.camera_id}] Video dosyası bulunamadı: {self.source}")
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5)

    def latest(self) -> Tuple[Optional[object], Optional[float]]:
        with self._lock:
            return self._frame, self._frame_ts

    def _run(self) -> None:
        backoff = 2.0
        while not self._stop.is_set():
            cap = open_capture(self.source)
            if not cap.isOpened():
                self.connected = False
                if self.is_file:
                    log.error("[%s] Video dosyası açılamadı: %s", self.camera_id, self.source)
                    self.finished = True
                    return
                log.warning("[%s] Kameraya bağlanılamadı, %.0f sn sonra tekrar denenecek.", self.camera_id, backoff)
                self._stop.wait(backoff)
                backoff = min(backoff * 2, 60.0)
                continue

            log.info("[%s] Kamera bağlandı.", self.camera_id)
            self.connected = True
            backoff = 2.0
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            frame_interval = 1.0 / fps if self.is_file and 0 < fps < 240 else 0.0
            failures = 0
            while not self._stop.is_set():
                started = time.monotonic()
                ok, frame = cap.read()
                if not ok:
                    failures += 1
                    if self.is_file:
                        self.finished = True
                        cap.release()
                        self.connected = False
                        return
                    if failures >= 25:
                        log.warning("[%s] Görüntü gelmiyor, yeniden bağlanılıyor.", self.camera_id)
                        break
                    time.sleep(0.2)
                    continue
                failures = 0
                with self._lock:
                    self._frame = frame
                    self._frame_ts = time.time()
                if frame_interval:
                    remaining = frame_interval - (time.monotonic() - started)
                    if remaining > 0:
                        time.sleep(remaining)
            cap.release()
            self.connected = False


def grab_snapshot(source: str, timeout_s: float = 15.0):
    """Tek bir kare alır (bölge çizimi için). Bulamazsa None döndürür."""
    cap = open_capture(source)
    try:
        deadline = time.monotonic() + timeout_s
        frame = None
        # İlk kareler çoğu kamerada bozuk/gri gelir; birkaç kare atlanır.
        for _ in range(10):
            if time.monotonic() > deadline:
                break
            ok, f = cap.read()
            if ok:
                frame = f
        return frame
    finally:
        cap.release()
