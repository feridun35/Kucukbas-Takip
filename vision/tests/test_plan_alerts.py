import unittest
from datetime import time

from shepherd_vision.alerts import AlertGate, in_hours, parse_hours
from shepherd_vision.plan import PlanMapper


class PlanMapperTest(unittest.TestCase):
    def test_maps_reference_points_exactly(self):
        img = [(0.1, 0.9), (0.9, 0.9), (0.7, 0.3), (0.3, 0.3)]  # perspektifli yamuk
        plan = [(0, 0), (20, 0), (20, 15), (0, 15)]
        m = PlanMapper(img, plan)
        for (x, y), (u, v) in zip(img, plan):
            pu, pv = m.map(x, y)
            self.assertAlmostEqual(pu, u, places=6)
            self.assertAlmostEqual(pv, v, places=6)

    def test_identity_scale(self):
        m = PlanMapper([(0, 0), (1, 0), (1, 1), (0, 1)], [(0, 0), (10, 0), (10, 10), (0, 10)])
        self.assertEqual(tuple(round(c, 6) for c in m.map(0.5, 0.25)), (5.0, 2.5))

    def test_collinear_rejected(self):
        with self.assertRaises(ValueError):
            PlanMapper([(0, 0), (0.5, 0.5), (1, 1), (0.2, 0.2)], [(0, 0), (1, 0), (1, 1), (0, 1)])

    def test_wrong_count(self):
        with self.assertRaises(ValueError):
            PlanMapper([(0, 0), (1, 0), (1, 1)], [(0, 0), (1, 0), (1, 1)])


class AlertTest(unittest.TestCase):
    def test_overnight_hours(self):
        h = parse_hours("20:00-06:00")
        self.assertTrue(in_hours(time(23, 0), h))
        self.assertTrue(in_hours(time(5, 59), h))
        self.assertFalse(in_hours(time(6, 0), h))
        self.assertFalse(in_hours(time(12, 0), h))

    def test_daytime_and_empty(self):
        self.assertTrue(in_hours(time(10, 0), parse_hours("08:00-18:00")))
        self.assertFalse(in_hours(time(19, 0), parse_hours("08:00-18:00")))
        self.assertTrue(in_hours(time(3, 0), parse_hours("")))

    def test_bad_format(self):
        with self.assertRaises(ValueError):
            parse_hours("akşam")

    def test_cooldown_per_camera_and_label(self):
        g = AlertGate(None, cooldown_s=300)
        noon = time(12, 0)
        self.assertTrue(g.should_alert("avlu", "dog", 0, noon))
        self.assertFalse(g.should_alert("avlu", "dog", 100, noon))
        self.assertTrue(g.should_alert("avlu", "person", 100, noon))
        self.assertTrue(g.should_alert("ahir", "dog", 100, noon))
        self.assertTrue(g.should_alert("avlu", "dog", 301, noon))


if __name__ == "__main__":
    unittest.main()
