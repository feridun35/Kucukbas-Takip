"""SupabaseReporter: sahte bir Supabase sunucusuna karşı giriş, kuyruk ve çevrimdışı davranış."""

import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from shepherd_vision.reporter import SupabaseReporter


class FakeSupabase(BaseHTTPRequestHandler):
    rows = {}
    logins = 0
    fail_rest = False

    def log_message(self, *args):
        pass

    def _json(self, code, body=None):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if body is not None:
            self.wfile.write(json.dumps(body).encode())

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])) or b"null")
        if self.path.startswith("/auth/v1/token?grant_type=password"):
            if body.get("password") != "dogru":
                return self._json(400, {"error": "invalid_grant"})
            FakeSupabase.logins += 1
            return self._json(200, {"access_token": "tok", "refresh_token": "ref", "expires_in": 3600, "user": {"id": "u1"}})
        if self.headers.get("Authorization") != "Bearer tok":
            return self._json(401, {"message": "JWT"})
        if FakeSupabase.fail_rest:
            return self._json(503, {"message": "down"})
        table = self.path.split("/rest/v1/")[1].split("?")[0]
        rows = body if isinstance(body, list) else [body]
        FakeSupabase.rows.setdefault(table, []).extend(rows)
        return self._json(201)


class ReporterTest(unittest.TestCase):
    def setUp(self):
        FakeSupabase.rows = {}
        FakeSupabase.logins = 0
        FakeSupabase.fail_rest = False
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeSupabase)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.tmp = tempfile.TemporaryDirectory()
        self.queue = str(Path(self.tmp.name) / "q.sqlite3")

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def make(self, password="dogru", url=None):
        r = SupabaseReporter(url or self.url, "anahtar", "a@b.c", password, self.queue)
        r.session.trust_env = False  # testte proxy kullanılmasın
        return r

    def test_records_are_sent_in_batches_and_removed_from_queue(self):
        r = self.make()
        for i in range(5):
            r.record("vision_zone_visits", {"zone_id": "yemlik", "track_id": i})
        r.record("vision_alerts", {"label": "dog"})
        self.assertEqual(r.flush(), 6)
        self.assertEqual(r.pending(), 0)
        self.assertEqual(len(FakeSupabase.rows["vision_zone_visits"]), 5)
        self.assertEqual(FakeSupabase.logins, 1)
        r.close()

    def test_offline_keeps_queue_until_server_returns(self):
        r = self.make(url="http://127.0.0.1:9")  # kapalı port
        r.record("vision_zone_counts", {"zone_id": "suluk", "animal_count": 4})
        self.assertEqual(r.flush(), 0)
        self.assertEqual(r.pending(), 1)
        r._db.close()
        r2 = self.make()  # servis yeniden başladı, internet geldi
        self.assertEqual(r2.pending(), 1)
        self.assertEqual(r2.flush(), 1)
        self.assertEqual(FakeSupabase.rows["vision_zone_counts"][0]["animal_count"], 4)
        r2.close()

    def test_server_error_keeps_records(self):
        r = self.make()
        r.record("vision_alerts", {"label": "person"})
        FakeSupabase.fail_rest = True
        self.assertEqual(r.flush(), 0)
        self.assertEqual(r.pending(), 1)
        FakeSupabase.fail_rest = False
        self.assertEqual(r.flush(), 1)
        r.close()

    def test_wrong_password_sends_nothing(self):
        r = self.make(password="yanlis")
        r.record("vision_alerts", {"label": "dog"})
        with self.assertLogs("shepherd_vision.reporter", level="ERROR"):
            self.assertEqual(r.flush(), 0)
        self.assertEqual(r.pending(), 1)
        r.password = "dogru"
        self.assertEqual(r.flush(), 0)  # bekleme süresi dolmadan tekrar giriş denenmez
        self.assertEqual(FakeSupabase.logins, 0)
        r._login_retry_at = 0
        self.assertEqual(r.flush(), 1)
        r._db.close()

    def test_live_upsert_includes_owner(self):
        r = self.make()
        r.live("avlu", {"updated_at": "x", "animals": [{"id": 1}], "counts": {}})
        row = FakeSupabase.rows["vision_live"][0]
        self.assertEqual((row["owner_id"], row["camera_id"]), ("u1", "avlu"))
        self.assertEqual(r.pending(), 0)  # canlı konum kuyruğa girmez
        r.close()

    def test_unknown_table_rejected(self):
        r = self.make()
        with self.assertRaises(ValueError):
            r.record("farms_data", {})
        r.close()


if __name__ == "__main__":
    unittest.main()
