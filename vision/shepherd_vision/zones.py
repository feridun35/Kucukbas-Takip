"""Bölge (yemlik, suluk, ahır…) giriş-çıkış ve süre hesabı.

Saf modül: kamera, model veya ağ bilgisi gerektirmez; birim testleri doğrudan çalışır.
Bütün koordinatlar normalize edilir (0–1): kameranın ana veya alt akışı farklı
çözünürlükte olsa da aynı bölge tanımı geçerli kalır.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

Point = Tuple[float, float]


def point_in_polygon(x: float, y: float, polygon: Sequence[Point]) -> bool:
    """Işın atma yöntemiyle noktanın çokgen içinde olup olmadığı."""
    inside = False
    n = len(polygon)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > y) != (yj > y):
            x_cross = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


@dataclass(frozen=True)
class Zone:
    id: str
    name: str
    polygon: Tuple[Point, ...]

    def contains(self, x: float, y: float) -> bool:
        return point_in_polygon(x, y, self.polygon)


@dataclass(frozen=True)
class ZoneVisit:
    """Bir hayvanın bir bölgedeki tamamlanmış ziyareti."""

    camera_id: str
    zone_id: str
    track_id: int
    entered_at: float  # unix zamanı (sn)
    exited_at: float

    @property
    def duration_s(self) -> float:
        return max(0.0, self.exited_at - self.entered_at)


@dataclass
class _Presence:
    first_seen: float
    last_seen: float
    confirmed: bool = False


@dataclass
class ZoneTracker:
    """Takip numarası verilmiş hayvanların bölge ziyaretlerini çıkarır.

    - Bir hayvan bölgede `enter_confirm_s` saniye görülmeden giriş sayılmaz
      (bölge sınırında bir an görünüp kaybolan kutular ziyaret yazmaz).
    - Bölgeden `exit_grace_s` saniye görülmezse çıkmış sayılır; bu süre içinde
      geri gelirse (başka koyun önünü kapattı, model bir kare kaçırdı) aynı ziyaret sürer.
    - Ziyaretin süresi ilk ve son görülme arasıdır; tolerans süresi eklenmez.
    """

    camera_id: str
    zones: Sequence[Zone]
    enter_confirm_s: float = 3.0
    exit_grace_s: float = 10.0
    _presence: Dict[Tuple[int, str], _Presence] = field(default_factory=dict, init=False)
    _last_ts: Optional[float] = field(default=None, init=False)

    def update(self, ts: float, positions: Dict[int, Point]) -> List[ZoneVisit]:
        """Bir karedeki konumları işler, bu adımda tamamlanan ziyaretleri döndürür.

        positions: takip numarası → normalize (x, y). Ayak noktası (kutunun alt ortası) önerilir.
        """
        self._last_ts = ts
        for track_id, (x, y) in positions.items():
            for zone in self.zones:
                if not zone.contains(x, y):
                    continue
                key = (track_id, zone.id)
                p = self._presence.get(key)
                if p is None:
                    p = self._presence[key] = _Presence(first_seen=ts, last_seen=ts)
                else:
                    p.last_seen = ts
                if not p.confirmed and ts - p.first_seen >= self.enter_confirm_s:
                    p.confirmed = True
        return self._expire(lambda p: ts - p.last_seen > self.exit_grace_s)

    def flush(self) -> List[ZoneVisit]:
        """Servis kapanırken açık ziyaretleri son görülme anıyla kapatır."""
        return self._expire(lambda p: True)

    def counts(self) -> Dict[str, int]:
        """Her bölgede şu an bulunan (girişi onaylanmış) hayvan sayısı."""
        result = {z.id: 0 for z in self.zones}
        for (_, zone_id), p in self._presence.items():
            if p.confirmed:
                result[zone_id] = result.get(zone_id, 0) + 1
        return result

    def _expire(self, should_close) -> List[ZoneVisit]:
        visits: List[ZoneVisit] = []
        for key in [k for k, p in self._presence.items() if should_close(p)]:
            p = self._presence.pop(key)
            if p.confirmed:
                visits.append(ZoneVisit(self.camera_id, key[1], key[0], p.first_seen, p.last_seen))
        visits.sort(key=lambda v: (v.entered_at, v.zone_id, v.track_id))
        return visits


def zones_from_config(raw: Iterable[dict]) -> List[Zone]:
    """zones.yaml içindeki bir kameranın bölge listesini doğrular ve Zone nesnelerine çevirir."""
    zones: List[Zone] = []
    seen = set()
    for item in raw or []:
        zone_id = str(item.get("id", "")).strip()
        if not zone_id:
            raise ValueError("Her bölgenin bir 'id' değeri olmalı (örn. yemlik).")
        if zone_id in seen:
            raise ValueError(f"Bölge kimliği tekrar ediyor: {zone_id}")
        seen.add(zone_id)
        polygon = tuple((float(p[0]), float(p[1])) for p in item.get("polygon", []))
        if len(polygon) < 3:
            raise ValueError(f"'{zone_id}' bölgesinde en az 3 köşe noktası olmalı.")
        if any(not (0.0 <= c <= 1.0) for pt in polygon for c in pt):
            raise ValueError(
                f"'{zone_id}' bölgesinin köşeleri 0 ile 1 arasında olmalı (görüntü genişliğine/yüksekliğine oran)."
            )
        zones.append(Zone(zone_id, str(item.get("name") or zone_id), polygon))
    return zones
