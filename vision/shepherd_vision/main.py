"""Komut satırı: snapshot · zones · points · run

    python -m shepherd_vision snapshot            # her kameradan bir fotoğraf al
    python -m shepherd_vision zones --camera avlu # fotoğraf üzerinde bölge çiz
    python -m shepherd_vision points --camera avlu# plan eşleştirmesi için 4 nokta seç
    python -m shepherd_vision run --show          # çalıştır (pencerede canlı izle)
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import yaml

from .alerts import AlertGate, parse_hours
from .config import ConfigError, load_config, load_yaml, load_zones, zones_path
from .plan import mapper_from_config
from .zones import Zone, ZoneTracker, ZoneVisit

log = logging.getLogger("shepherd_vision")

WHOLE_FRAME_ZONE = "tum_goruntu"  # vision_zone_counts'ta kameranın gördüğü toplam hayvan


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds")


def visit_row(v: ZoneVisit) -> dict:
    return {
        "camera_id": v.camera_id,
        "zone_id": v.zone_id,
        "track_id": v.track_id,
        "entered_at": iso(v.entered_at),
        "exited_at": iso(v.exited_at),
        "duration_s": int(round(v.duration_s)),
    }


# ─────────────────────────── Çizim yardımcıları ───────────────────────────
def _px(pt, w, h):
    return int(pt[0] * w), int(pt[1] * h)


def draw_overlay(frame, zones: List[Zone], tracks, alerts, counts: Dict[str, int]):
    import cv2
    import numpy as np

    h, w = frame.shape[:2]
    out = frame.copy()
    for zone in zones:
        pts = np.array([_px(p, w, h) for p in zone.polygon], dtype=np.int32)
        cv2.polylines(out, [pts], True, (0, 200, 255), 2)
        cx, cy = pts.mean(axis=0).astype(int)
        cv2.putText(out, f"{zone.name}: {counts.get(zone.id, 0)}", (int(cx) - 40, int(cy)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 255), 2)
    for det in tracks:
        x1, y1 = _px(det.box[:2], w, h)
        x2, y2 = _px(det.box[2:], w, h)
        cv2.rectangle(out, (x1, y1), (x2, y2), (80, 220, 80), 2)
        cv2.putText(out, f"#{det.track_id}", (x1, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (80, 220, 80), 2)
        cv2.circle(out, _px(det.foot_point, w, h), 3, (80, 220, 80), -1)
    for det in alerts:
        x1, y1 = _px(det.box[:2], w, h)
        x2, y2 = _px(det.box[2:], w, h)
        cv2.rectangle(out, (x1, y1), (x2, y2), (0, 0, 255), 3)
        cv2.putText(out, det.label, (x1, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
    cv2.putText(out, f"Koyun: {len(tracks)}", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    return out


# ─────────────────────────── Kamera işçisi ───────────────────────────
class CameraWorker(threading.Thread):
    def __init__(self, cam: dict, cfg: dict, zones: List[Zone], reporter, gate: AlertGate, show: bool, save_dir: Optional[Path]):
        super().__init__(name=f"worker-{cam['id']}", daemon=True)
        from .camera import CameraStream
        from .detector import SheepDetector

        det_cfg = cfg.get("detection") or {}
        trk_cfg = cfg.get("tracking") or {}
        rep_cfg = cfg.get("reporting") or {}
        alert_cfg = cfg.get("alerts") or {}
        self.cam = cam
        self.cam_id = cam["id"]
        self.zones = zones
        self.reporter = reporter
        self.gate = gate
        self.show = show
        self.save_dir = save_dir
        self.period = 1.0 / float(cam.get("process_fps", det_cfg.get("process_fps", 1.0)))
        self.live_interval = float(rep_cfg.get("live_interval_s", 3))
        self.counts_interval = float(rep_cfg.get("counts_interval_s", 300))
        self.alerts_enabled = bool(alert_cfg.get("enabled", True))
        self.stream = CameraStream(self.cam_id, cam["source"])
        self.detector = SheepDetector(
            model_path=str(det_cfg.get("model", "yolo11n.pt")),
            track_classes=det_cfg.get("track_classes", ["sheep"]),
            alert_classes=alert_cfg.get("classes", ["dog", "person", "bear"]) if self.alerts_enabled else [],
            confidence=float(det_cfg.get("confidence", 0.35)),
            image_size=int(det_cfg.get("image_size", 640)),
            device=str(det_cfg.get("device", "")),
        )
        self.tracker = ZoneTracker(
            self.cam_id,
            zones,
            enter_confirm_s=float(trk_cfg.get("enter_confirm_s", 3)),
            exit_grace_s=float(trk_cfg.get("exit_grace_s", 10)),
        )
        self.mapper = mapper_from_config(cam)
        self.min_alert_conf = float(alert_cfg.get("min_confidence", 0.5))
        self.latest_annotated = None
        self._tracks = []
        self.stop_event = threading.Event()
        self.done = False
        self._writer = None

    def run(self) -> None:
        self.stream.start()
        last_frame_ts = None
        last_live = 0.0
        last_counts = time.time()
        try:
            while not self.stop_event.is_set():
                started = time.monotonic()
                frame, frame_ts = self.stream.latest()
                if frame is not None and frame_ts != last_frame_ts:
                    last_frame_ts = frame_ts
                    self._process(frame, frame_ts)
                now = time.time()
                if now - last_live >= self.live_interval:
                    last_live = now
                    self._send_live(now)
                if now - last_counts >= self.counts_interval:
                    last_counts = now
                    self._record_counts(now)
                if self.stream.finished:
                    break
                self.stop_event.wait(max(0.0, self.period - (time.monotonic() - started)))
        finally:
            for v in self.tracker.flush():
                self.reporter.record("vision_zone_visits", visit_row(v))
            self._send_live(time.time(), connected=False)
            self.stream.stop()
            if self._writer is not None:
                self._writer.release()
            self.done = True

    def _process(self, frame, ts: float) -> None:
        try:
            tracks, alerts = self.detector.process(frame)
        except Exception:  # model hatası tek kareyi kaybettirir, servisi durdurmaz
            log.exception("[%s] Kare işlenemedi.", self.cam_id)
            return
        self._tracks = tracks
        for v in self.tracker.update(ts, {d.track_id: d.foot_point for d in tracks}):
            self.reporter.record("vision_zone_visits", visit_row(v))
            log.info("[%s] #%d %s bölgesinde %d sn kaldı.", self.cam_id, v.track_id, v.zone_id, round(v.duration_s))
        local_now = datetime.now().time()
        for det in alerts:
            if det.confidence < self.min_alert_conf:
                continue
            if self.gate.should_alert(self.cam_id, det.label, ts, local_now):
                log.warning("[%s] UYARI: %s görüldü (%%%d).", self.cam_id, det.label, round(det.confidence * 100))
                self.reporter.record("vision_alerts", {
                    "camera_id": self.cam_id,
                    "label": det.label,
                    "confidence": round(det.confidence, 3),
                    "detected_at": iso(ts),
                })
        if self.show or self.save_dir:
            annotated = draw_overlay(frame, self.zones, tracks, alerts, self.tracker.counts())
            self.latest_annotated = annotated
            if self.save_dir:
                self._save(annotated)

    def _save(self, frame) -> None:
        import cv2

        if self._writer is None:
            h, w = frame.shape[:2]
            path = self.save_dir / f"{self.cam_id}_islenmis.mp4"
            self._writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), max(1.0, 1.0 / self.period), (w, h))
            log.info("[%s] İşlenmiş video kaydediliyor: %s", self.cam_id, path)
        self._writer.write(frame)

    def _send_live(self, now: float, connected: Optional[bool] = None) -> None:
        tracks = self._tracks
        animals = []
        for d in tracks:
            x, y = d.foot_point
            item = {"id": d.track_id, "x": round(x, 4), "y": round(y, 4)}
            if self.mapper:
                px, py = self.mapper.map(x, y)
                item["px"], item["py"] = round(px, 2), round(py, 2)
            animals.append(item)
        is_connected = self.stream.connected if connected is None else connected
        self.reporter.live(self.cam_id, {
            "updated_at": iso(now),
            "connected": is_connected,
            "animals": animals if is_connected else [],
            "counts": self.tracker.counts(),
        })

    def _record_counts(self, now: float) -> None:
        if not self.stream.connected:
            return
        counts = self.tracker.counts()
        counts[WHOLE_FRAME_ZONE] = len(self._tracks)
        for zone_id, n in counts.items():
            self.reporter.record("vision_zone_counts", {
                "camera_id": self.cam_id, "zone_id": zone_id, "sampled_at": iso(now), "animal_count": n,
            })


# ─────────────────────────── Komutlar ───────────────────────────
def cmd_run(cfg: dict, args) -> int:
    from .reporter import build_reporter

    base = Path(cfg["_base_dir"])
    zones = load_zones(cfg)
    alert_cfg = cfg.get("alerts") or {}
    gate = AlertGate(parse_hours(alert_cfg.get("hours")), float(alert_cfg.get("cooldown_s", 300)))
    reporter = build_reporter(cfg, base)
    save_dir = None
    if args.save:
        save_dir = base / "output"
        save_dir.mkdir(parents=True, exist_ok=True)
    cams = [c for c in cfg["cameras"] if not args.camera or c["id"] == args.camera]
    if not cams:
        raise ConfigError(f"'{args.camera}' adında kamera yok.")
    workers = [CameraWorker(c, cfg, zones[c["id"]], reporter, gate, args.show, save_dir) for c in cams]
    for c, w in zip(cams, workers):
        if not zones[c["id"]]:
            log.warning("[%s] Bölge çizilmemiş: yalnızca sayım ve canlı konum gönderilecek.", c["id"])
        w.start()

    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, lambda *_: stop.set())
    log.info("Çalışıyor. Durdurmak için Ctrl+C.")
    last_flush = 0.0
    try:
        while not stop.is_set() and not all(w.done for w in workers):
            if args.show:
                import cv2

                for w in workers:
                    if w.latest_annotated is not None:
                        cv2.imshow(f"ShepherdAI - {w.cam_id}", w.latest_annotated)
                if cv2.waitKey(50) & 0xFF == ord("q"):
                    break
            else:
                stop.wait(0.5)
            if time.time() - last_flush > 5:
                last_flush = time.time()
                reporter.flush()
    finally:
        for w in workers:
            w.stop_event.set()
        for w in workers:
            w.join(timeout=10)
        reporter.close()
        if args.show:
            import cv2

            cv2.destroyAllWindows()
    return 0


def _snapshot_for(cfg: dict, cam: dict, refresh: bool):
    import cv2
    from .camera import grab_snapshot

    path = Path(cfg["_base_dir"]) / "snapshots" / f"{cam['id']}.jpg"
    if path.exists() and not refresh:
        return cv2.imread(str(path)), path
    frame = grab_snapshot(cam["source"])
    if frame is None:
        raise ConfigError(f"[{cam['id']}] Kameradan görüntü alınamadı. RTSP adresini VLC ile deneyin (README, 2. adım).")
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), frame)
    return frame, path


def cmd_snapshot(cfg: dict, args) -> int:
    ok = True
    for cam in cfg["cameras"]:
        if args.camera and cam["id"] != args.camera:
            continue
        try:
            frame, path = _snapshot_for(cfg, cam, refresh=True)
            print(f"✔ {cam['id']}: {path} ({frame.shape[1]}x{frame.shape[0]})")
        except ConfigError as exc:
            ok = False
            print(f"✘ {exc}")
    return 0 if ok else 1


def _find_camera(cfg: dict, cam_id: Optional[str]) -> dict:
    if not cam_id:
        if len(cfg["cameras"]) == 1:
            return cfg["cameras"][0]
        raise ConfigError("Birden fazla kamera var; --camera ile birini seçin.")
    for cam in cfg["cameras"]:
        if cam["id"] == cam_id:
            return cam
    raise ConfigError(f"'{cam_id}' adında kamera yok.")


def _click_points(frame, title: str, existing: List[Zone], max_points: Optional[int] = None):
    """Fareyle nokta toplar. Sol tık: nokta ekle · Sağ tık/u: geri al · Enter: bitir · Esc: iptal."""
    import cv2
    import numpy as np

    h, w = frame.shape[:2]
    points: List[tuple] = []

    def on_mouse(event, x, y, *_):
        if event == cv2.EVENT_LBUTTONDOWN and (max_points is None or len(points) < max_points):
            points.append((round(x / w, 4), round(y / h, 4)))
        elif event == cv2.EVENT_RBUTTONDOWN and points:
            points.pop()

    cv2.namedWindow(title, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(title, on_mouse)
    while True:
        img = draw_overlay(frame, existing, [], [], {})
        for i, p in enumerate(points):
            cv2.circle(img, _px(p, w, h), 5, (255, 0, 255), -1)
            cv2.putText(img, str(i + 1), _px(p, w, h), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 255), 2)
        if len(points) > 1:
            cv2.polylines(img, [np.array([_px(p, w, h) for p in points], dtype=np.int32)], max_points is None, (255, 0, 255), 2)
        cv2.imshow(title, img)
        key = cv2.waitKey(30) & 0xFF
        if key in (13, 10):
            break
        if key == 27:
            points = []
            break
        if key == ord("u") and points:
            points.pop()
    cv2.destroyWindow(title)
    return points


def cmd_zones(cfg: dict, args) -> int:
    from .zones import zones_from_config

    cam = _find_camera(cfg, args.camera)
    frame, _ = _snapshot_for(cfg, cam, refresh=args.refresh)
    path = zones_path(cfg)
    all_zones = load_yaml(path)
    cam_zones = list(all_zones.get(cam["id"]) or [])
    print("Sol tık: köşe ekle · Sağ tık veya u: son köşeyi sil · Enter: bölgeyi bitir · Esc: vazgeç")
    while True:
        existing = zones_from_config(cam_zones)
        print(f"Mevcut bölgeler: {', '.join(z.id for z in existing) or 'yok'}")
        pts = _click_points(frame, f"Bolge ciz - {cam['id']}", existing)
        if len(pts) >= 3:
            zone_id = input("Bölge kimliği (örn. yemlik, suluk, ahir): ").strip()
            name = input("Görünen ad (boş bırakılırsa kimlik kullanılır): ").strip() or zone_id
            if zone_id:
                cam_zones = [z for z in cam_zones if z.get("id") != zone_id]
                cam_zones.append({"id": zone_id, "name": name, "polygon": [list(p) for p in pts]})
        elif pts:
            print("En az 3 köşe gerekli; bölge eklenmedi.")
        if input("Başka bölge çizilsin mi? (e/h): ").strip().lower() not in ("e", "evet", "y"):
            break
    all_zones[cam["id"]] = cam_zones
    zones_from_config(cam_zones)  # kaydetmeden önce doğrula
    with path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(all_zones, f, allow_unicode=True, sort_keys=False)
    print(f"✔ {len(cam_zones)} bölge kaydedildi: {path}")
    return 0


def cmd_points(cfg: dict, args) -> int:
    cam = _find_camera(cfg, args.camera)
    frame, _ = _snapshot_for(cfg, cam, refresh=args.refresh)
    print("Zeminde planda yerini bildiğiniz 4 noktaya sırayla tıklayın, sonra Enter.")
    pts = _click_points(frame, f"Plan noktalari - {cam['id']}", load_zones(cfg)[cam["id"]], max_points=4)
    if len(pts) != 4:
        print("4 nokta seçilmedi.")
        return 1
    print("\nconfig.yaml içinde bu kameranın altına yapıştırın; plan_points değerlerini metre olarak doldurun:\n")
    print("    image_points: " + str([list(p) for p in pts]))
    print("    plan_points: [[0, 0], [10, 0], [10, 8], [0, 8]]  # aynı sırayla, plandaki yerleri (m)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="shepherd_vision", description="ShepherdAI kamera yapay zekası")
    p.add_argument("--config", default="config.yaml", help="ayar dosyası (varsayılan: config.yaml)")
    p.add_argument("-v", "--verbose", action="store_true", help="ayrıntılı günlük")
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("snapshot", help="her kameradan bir fotoğraf al (snapshots/)")
    s.add_argument("--camera")
    for name, helptext in (("zones", "fotoğraf üzerinde bölge çiz"), ("points", "plan eşleştirmesi için 4 nokta seç")):
        z = sub.add_parser(name, help=helptext)
        z.add_argument("--camera")
        z.add_argument("--refresh", action="store_true", help="kayıtlı fotoğraf yerine kameradan yenisini al")
    r = sub.add_parser("run", help="servisi çalıştır")
    r.add_argument("--camera", help="yalnızca bu kamerayı çalıştır")
    r.add_argument("--show", action="store_true", help="işlenmiş görüntüyü pencerede göster")
    r.add_argument("--save", action="store_true", help="işlenmiş görüntüyü output/ klasörüne video olarak kaydet")
    return p


def main(argv: Optional[List[str]] = None) -> None:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    try:
        cfg = load_config(args.config)
        handler = {"run": cmd_run, "snapshot": cmd_snapshot, "zones": cmd_zones, "points": cmd_points}[args.command]
        sys.exit(handler(cfg, args))
    except ConfigError as exc:
        print(f"Ayar hatası: {exc}", file=sys.stderr)
        sys.exit(2)
