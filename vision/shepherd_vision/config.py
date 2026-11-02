"""config.yaml ve zones.yaml dosyalarını okur ve doğrular."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Dict, List

import yaml

from .zones import Zone, zones_from_config

log = logging.getLogger(__name__)


class ConfigError(ValueError):
    pass


def load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_config(path: str) -> dict:
    cfg_path = Path(path).resolve()
    if not cfg_path.exists():
        raise ConfigError(f"Ayar dosyası bulunamadı: {cfg_path}. config.example.yaml dosyasını config.yaml olarak kopyalayın.")
    cfg = load_yaml(cfg_path)
    cfg["_base_dir"] = cfg_path.parent

    cameras = cfg.get("cameras") or []
    if not cameras:
        raise ConfigError("config.yaml içinde en az bir kamera tanımlı olmalı ('cameras:').")
    ids = set()
    for cam in cameras:
        cam_id = str(cam.get("id", "")).strip()
        if not cam_id:
            raise ConfigError("Her kameranın bir 'id' değeri olmalı (örn. avlu).")
        if cam_id in ids:
            raise ConfigError(f"Kamera kimliği tekrar ediyor: {cam_id}")
        if not str(cam.get("source", "")).strip():
            raise ConfigError(f"'{cam_id}' kamerasının 'source' (RTSP adresi veya video dosyası) değeri boş.")
        ids.add(cam_id)
        cam["id"] = cam_id
        cam["source"] = str(cam["source"]).strip()
        src = cam["source"]
        if "://" not in src and not src.isdigit() and not os.path.isabs(src):
            cam["source"] = str((cfg_path.parent / src).resolve())

    # Şifre ayar dosyasında durmasın isteniyorsa ortam değişkeniyle verilebilir.
    sb = cfg.setdefault("supabase", {}) or {}
    sb["email"] = os.environ.get("SHEPHERD_EMAIL", sb.get("email", ""))
    sb["password"] = os.environ.get("SHEPHERD_PASSWORD", sb.get("password", ""))
    cfg["supabase"] = sb
    return cfg


def zones_path(cfg: dict) -> Path:
    return Path(cfg["_base_dir"]) / cfg.get("zones_file", "zones.yaml")


def load_zones(cfg: dict) -> Dict[str, List[Zone]]:
    raw = load_yaml(zones_path(cfg))
    known = {c["id"] for c in cfg["cameras"]}
    unknown = sorted(set(raw) - known)
    if unknown:
        # Kamera config.yaml'dan çıkarılmış olabilir; bölgeleri silinmez, yalnızca kullanılmaz.
        log.warning("zones.yaml içindeki şu kameralar config.yaml'da yok, bölgeleri atlanıyor: %s", ", ".join(unknown))
    try:
        return {cam_id: zones_from_config(raw.get(cam_id) or []) for cam_id in known}
    except ValueError as exc:
        raise ConfigError(f"zones.yaml: {exc}") from exc
