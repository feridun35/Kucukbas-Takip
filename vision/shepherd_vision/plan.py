"""Kamera görüntüsündeki noktayı çiftliğin kuşbakışı planına (metre) çevirir.

Her kamera için zemindeki 4 belirgin noktanın (direk dibi, kapı köşesi, yemlik ucu…)
görüntüdeki yeri ile plandaki yeri eşleştirilir; aradaki perspektif dönüşümü buradan hesaplanır.
Saf modül: yalnızca numpy kullanır.
"""

from __future__ import annotations

from typing import Optional, Sequence, Tuple

import numpy as np

Point = Tuple[float, float]


class PlanMapper:
    def __init__(self, image_points: Sequence[Point], plan_points: Sequence[Point]):
        if len(image_points) != 4 or len(plan_points) != 4:
            raise ValueError("Plan eşleştirmesi için tam 4 görüntü noktası ve 4 plan noktası gerekir.")
        a = []
        b = []
        for (x, y), (u, v) in zip(image_points, plan_points):
            a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
            b.append(u)
            a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
            b.append(v)
        try:
            h = np.linalg.solve(np.array(a, dtype=float), np.array(b, dtype=float))
        except np.linalg.LinAlgError as exc:
            raise ValueError("Plan noktaları geçersiz: 4 noktanın üçü aynı doğru üzerinde olmamalı.") from exc
        self._h = np.append(h, 1.0).reshape(3, 3)

    def map(self, x: float, y: float) -> Point:
        u, v, w = self._h @ np.array([x, y, 1.0])
        return float(u / w), float(v / w)


def mapper_from_config(camera: dict) -> Optional[PlanMapper]:
    image_points = camera.get("image_points")
    plan_points = camera.get("plan_points")
    if not image_points and not plan_points:
        return None
    return PlanMapper([tuple(p) for p in image_points or []], [tuple(p) for p in plan_points or []])
