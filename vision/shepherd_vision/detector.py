"""YOLO ile koyun tespiti ve takibi (ByteTrack).

Hazır COCO modeli "sheep" sınıfını zaten tanır; ilk kurulumda eğitim gerekmez.
Kendi kameralarınızdan etiketlenmiş görüntülerle eğitilen model (README: "Modeli iyileştirme")
aynı yerden `model:` ayarıyla verilir.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence, Tuple


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    box: Tuple[float, float, float, float]  # normalize x1, y1, x2, y2
    track_id: int = -1

    @property
    def foot_point(self) -> Tuple[float, float]:
        """Kutunun alt ortası: hayvanın zemine bastığı yer; bölge ve plan hesabı buna göre yapılır."""
        x1, _, x2, y2 = self.box
        return (x1 + x2) / 2.0, y2


class SheepDetector:
    """Her kamera için ayrı örnek kullanılmalı: takipçi durumu modele bağlıdır."""

    def __init__(
        self,
        model_path: str,
        track_classes: Sequence[str] = ("sheep",),
        alert_classes: Sequence[str] = (),
        confidence: float = 0.35,
        image_size: int = 640,
        device: str = "",
        tracker: str = "bytetrack.yaml",
    ):
        from ultralytics import YOLO  # ağır içe aktarma; testlerde gerekmez

        self.model = YOLO(model_path)
        names = {str(v): int(k) for k, v in self.model.names.items()}
        missing = [c for c in [*track_classes, *alert_classes] if c not in names]
        if missing:
            raise ValueError(
                f"Model bu sınıfları tanımıyor: {', '.join(missing)}. Tanıdıkları: {', '.join(sorted(names))}"
            )
        self.track_classes = set(track_classes)
        self.alert_classes = set(alert_classes)
        self._class_ids = sorted({names[c] for c in [*track_classes, *alert_classes]})
        self.confidence = confidence
        self.image_size = image_size
        self.device = device or None
        self.tracker = tracker

    def process(self, frame) -> Tuple[List[Detection], List[Detection]]:
        """(takip edilen hayvanlar, uyarı sınıfı tespitleri) döndürür."""
        result = self.model.track(
            frame,
            persist=True,
            classes=self._class_ids,
            conf=self.confidence,
            imgsz=self.image_size,
            device=self.device,
            tracker=self.tracker,
            verbose=False,
        )[0]
        tracked: List[Detection] = []
        alerts: List[Detection] = []
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            return tracked, alerts
        xyxyn = boxes.xyxyn.tolist()
        confs = boxes.conf.tolist()
        classes = boxes.cls.tolist()
        ids = boxes.id.tolist() if boxes.id is not None else [None] * len(xyxyn)
        for box, conf, cls, tid in zip(xyxyn, confs, classes, ids):
            label = str(self.model.names[int(cls)])
            det = Detection(label, float(conf), tuple(float(v) for v in box), int(tid) if tid is not None else -1)
            if label in self.track_classes:
                if det.track_id >= 0:  # takip numarası henüz verilmemiş kutular sayılmaz
                    tracked.append(det)
            elif label in self.alert_classes:
                alerts.append(det)
        return tracked, alerts
