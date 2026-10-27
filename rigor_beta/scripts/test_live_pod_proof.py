"""Exercise the proof CLI over loopback HTTP; never contact a live service."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class LivePodProofTests(unittest.TestCase):
    def run_proof(self, mode="complete"):
        state = {
            "production": {"production_id": "synthetic-show"},
            "documents": [], "requirements": [],
            "conflicts": [{"category": category, "conflict_id": str(index)} for index, category in enumerate([
                "POWER_CAPACITY", "RIGGING_TRIM", "RIGGING_SUSPENDED_WEIGHT", "RIGGING_POINT_LOAD",
                "DOCK_ACCESS", "BSTAGE_FOOTPRINT", "SHOW_CURFEW", "LABOR_CALL",
            ])],
            "checkpoints": [{"checkpoint_id": name, "department": name, "status": "PENDING"}
                            for name in ["Rigging", "Video", "Audio"]],
            "readiness": {"status": "BLOCKED"},
        }
        observations = {"posts": 0, "polls": 0, "uploads": 0}

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, body, status=200):
                self.send_response(status)
                self.end_headers()
                self.wfile.write(body if isinstance(body, bytes) else json.dumps(body).encode())

            def do_GET(self):
                if self.path == "/deploy-meta.json":
                    changed = mode == "changed_commit" and observations["uploads"] == 3
                    return self.reply({"commit": "b" * 40 if mode == "wrong_commit" or changed else "a" * 40})
                if self.path.startswith("/api/reports/"):
                    return self.reply(b"%PDF-synthetic-test") if observations["posts"] else self.reply({"detail": "Sign in"}, 401)
                if self.path == "/api/workspace":
                    observations["polls"] += 1
                    doc = state["documents"][-1]
                    if mode == "wrong_production":
                        state["production"]["production_id"] = "other-show"
                    elif mode == "failed":
                        doc.update(status="FAILED", processing_error="PRIVATE_UPSTREAM_DETAIL")
                    elif mode != "timeout" and observations["polls"] % 2 == 0:
                        doc.update(status="PROCESSED", analysis_engine="DEERFLOW", analysis_receipt_id="receipt")
                        if mode == "missing_receipt":
                            doc.pop("analysis_receipt_id")
                    return self.reply(state)
                self.reply({}, 404)

            def do_POST(self):
                observations["posts"] += 1
                self.rfile.read(int(self.headers.get("Content-Length", 0)))
                if self.path == "/api/documents":
                    observations["uploads"] += 1
                    doc = {"document_id": str(observations["uploads"]), "status": "PROCESSING", "review_status": "PENDING"}
                    state["documents"].append(doc)
                    state["readiness"]["status"] = "BLOCKED"
                    if observations["uploads"] == 3:
                        for checkpoint in state["checkpoints"][:2]:
                            checkpoint["status"] = "PENDING"
                    return self.reply({"result": doc, "workspace": state}, 202)
                if self.path.endswith("/review"):
                    state["documents"][int(self.path.split("/")[-2]) - 1]["review_status"] = "REVIEWED"
                    if all(doc["review_status"] == "REVIEWED" for doc in state["documents"]):
                        state["readiness"]["status"] = "SHOW_READY"
                return self.reply(state, 201 if self.path == "/api/productions" else 200)

            def do_PATCH(self):
                self.rfile.read(int(self.headers.get("Content-Length", 0)))
                for checkpoint in state["checkpoints"]:
                    if self.path.endswith(checkpoint["checkpoint_id"]):
                        checkpoint["status"] = "COMPLETE"
                if all(item["status"] == "COMPLETE" for item in state["checkpoints"]):
                    state["readiness"]["status"] = "NEEDS_REVIEW"
                self.reply(state)

        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server, tempfile.TemporaryDirectory() as output:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                result = subprocess.run([
                    sys.executable, str(Path(__file__).with_name("live-pod-proof.py")),
                    "--url", f"http://127.0.0.1:{server.server_port}", "--output", output,
                    "--expected-commit", "a" * 40, "--analysis-timeout", "0.2", "--poll-interval", "0.01",
                ], capture_output=True, text=True, timeout=10)
                proof = Path(output, "proof.json")
                evidence = json.loads(proof.read_text()) if proof.exists() else {}
                return result, evidence, observations
            finally:
                server.shutdown()
                thread.join()

    def test_async_uploads_complete_only_after_saved_analysis(self):
        result, evidence, observations = self.run_proof()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(evidence["result"], "PASS")
        self.assertEqual(observations["uploads"], 3)
        self.assertGreaterEqual(observations["polls"], 6)

    def test_failure_timeout_and_missing_receipts_do_not_pass(self):
        for mode in ["failed", "timeout", "missing_receipt", "wrong_production"]:
            with self.subTest(mode=mode):
                result, evidence, observations = self.run_proof(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotEqual(evidence.get("result"), "PASS")
                self.assertEqual(observations["uploads"], 1)
                self.assertNotIn("PRIVATE_UPSTREAM_DETAIL", result.stdout + result.stderr + json.dumps(evidence))

    def test_wrong_revision_blocks_before_mutation(self):
        result, evidence, observations = self.run_proof("wrong_commit")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(observations["posts"], 0)
        self.assertNotEqual(evidence.get("result"), "PASS")

    def test_deployment_change_during_proof_invalidates_result(self):
        result, evidence, observations = self.run_proof("changed_commit")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(observations["uploads"], 3)
        self.assertEqual(evidence.get("result"), "FAIL")


if __name__ == "__main__":
    unittest.main()
