import unittest

from shepherd_vision.zones import Zone, ZoneTracker, point_in_polygon, zones_from_config

SQUARE = ((0.0, 0.0), (0.5, 0.0), (0.5, 0.5), (0.0, 0.5))


class PointInPolygonTest(unittest.TestCase):
    def test_inside_outside(self):
        self.assertTrue(point_in_polygon(0.25, 0.25, SQUARE))
        self.assertFalse(point_in_polygon(0.75, 0.25, SQUARE))

    def test_concave(self):
        l_shape = ((0, 0), (1, 0), (1, 0.4), (0.4, 0.4), (0.4, 1), (0, 1))
        self.assertTrue(point_in_polygon(0.2, 0.8, l_shape))
        self.assertFalse(point_in_polygon(0.8, 0.8, l_shape))

    def test_degenerate(self):
        self.assertFalse(point_in_polygon(0.1, 0.1, ((0, 0), (1, 1))))


class ZoneTrackerTest(unittest.TestCase):
    def make(self, **kw):
        return ZoneTracker("avlu", [Zone("yemlik", "Yemlik", SQUARE)], enter_confirm_s=3, exit_grace_s=10, **kw)

    def test_visit_duration_is_first_to_last_seen(self):
        t = self.make()
        for ts in range(0, 61):  # 60 sn yemlikte
            self.assertEqual(t.update(float(ts), {7: (0.2, 0.2)}), [])
        self.assertEqual(t.counts(), {"yemlik": 1})
        self.assertEqual(t.update(65.0, {7: (0.9, 0.9)}), [])  # tolerans içinde
        visits = t.update(71.0, {7: (0.9, 0.9)})
        self.assertEqual(len(visits), 1)
        v = visits[0]
        self.assertEqual((v.zone_id, v.track_id, v.entered_at, v.exited_at, v.duration_s), ("yemlik", 7, 0.0, 60.0, 60.0))
        self.assertEqual(t.counts(), {"yemlik": 0})

    def test_short_glimpse_is_not_a_visit(self):
        t = self.make()
        t.update(0.0, {1: (0.2, 0.2)})
        t.update(2.0, {1: (0.2, 0.2)})
        self.assertEqual(t.counts(), {"yemlik": 0})
        self.assertEqual(t.update(20.0, {}), [])

    def test_brief_occlusion_keeps_single_visit(self):
        t = self.make()
        for ts in (0, 5, 10):
            t.update(float(ts), {3: (0.1, 0.1)})
        t.update(18.0, {})            # 8 sn görünmedi (< 10)
        t.update(19.0, {3: (0.1, 0.1)})
        visits = t.update(40.0, {})
        self.assertEqual([(v.entered_at, v.exited_at) for v in visits], [(0.0, 19.0)])

    def test_multiple_animals_and_flush(self):
        t = self.make()
        for ts in range(0, 10):
            t.update(float(ts), {1: (0.1, 0.1), 2: (0.3, 0.3), 3: (0.8, 0.8)})
        self.assertEqual(t.counts(), {"yemlik": 2})
        visits = t.flush()
        self.assertEqual(sorted(v.track_id for v in visits), [1, 2])
        self.assertEqual(t.counts(), {"yemlik": 0})

    def test_overlapping_zones_count_separately(self):
        t = ZoneTracker("avlu", [Zone("a", "A", SQUARE), Zone("b", "B", ((0.25, 0.25), (1, 0.25), (1, 1), (0.25, 1)))])
        for ts in range(0, 5):
            t.update(float(ts), {9: (0.3, 0.3)})
        self.assertEqual(t.counts(), {"a": 1, "b": 1})


class ZonesFromConfigTest(unittest.TestCase):
    def test_valid(self):
        zones = zones_from_config([{"id": "suluk", "polygon": [[0, 0], [1, 0], [1, 1]]}])
        self.assertEqual(zones[0].name, "suluk")

    def test_errors(self):
        for bad in (
            [{"polygon": [[0, 0], [1, 0], [1, 1]]}],
            [{"id": "x", "polygon": [[0, 0], [1, 0]]}],
            [{"id": "x", "polygon": [[0, 0], [640, 0], [640, 480]]}],
            [{"id": "x", "polygon": [[0, 0], [1, 0], [1, 1]]}, {"id": "x", "polygon": [[0, 0], [1, 0], [1, 1]]}],
        ):
            with self.assertRaises(ValueError):
                zones_from_config(bad)


if __name__ == "__main__":
    unittest.main()
