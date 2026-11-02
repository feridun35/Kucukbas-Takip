"""Yırtıcı/yabancı uyarıları: belirli saatlerde köpek, kurt, insan görülürse bildir.

Hazır modelde "wolf" sınıfı yoktur; kurt çoğunlukla "dog" olarak görülür.
Saf modül: saat ve bekleme süresi hesabı test edilebilir.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time as dtime
from typing import Dict, Optional, Tuple


def parse_hours(value: Optional[str]) -> Optional[Tuple[dtime, dtime]]:
    """'20:00-06:00' biçimini çözer. Boş değer: günün her saati."""
    if not value:
        return None
    try:
        start_s, end_s = [part.strip() for part in value.split("-")]
        start = datetime.strptime(start_s, "%H:%M").time()
        end = datetime.strptime(end_s, "%H:%M").time()
    except ValueError as exc:
        raise ValueError(f"Uyarı saatleri 'SS:DD-SS:DD' biçiminde olmalı, verilen: {value!r}") from exc
    return start, end


def in_hours(moment: dtime, hours: Optional[Tuple[dtime, dtime]]) -> bool:
    if hours is None:
        return True
    start, end = hours
    if start <= end:
        return start <= moment < end
    return moment >= start or moment < end  # gece yarısını aşan aralık


@dataclass
class AlertGate:
    """Aynı kamera ve sınıf için `cooldown_s` içinde tekrar uyarı üretmez."""

    hours: Optional[Tuple[dtime, dtime]] = None
    cooldown_s: float = 300.0
    _last: Dict[Tuple[str, str], float] = field(default_factory=dict, init=False)

    def should_alert(self, camera_id: str, label: str, ts: float, local_time: dtime) -> bool:
        if not in_hours(local_time, self.hours):
            return False
        key = (camera_id, label)
        last = self._last.get(key)
        if last is not None and ts - last < self.cooldown_s:
            return False
        self._last[key] = ts
        return True
