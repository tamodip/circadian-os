from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

import app


class MutationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app.app)

    def payload(self, **overrides: object) -> dict[str, object]:
        body: dict[str, object] = {
            "task": "Fix auth refresh regression and add a test",
            "energy": 72,
            "noise_dbfs": -42,
            "typing_fatigue": 18,
            "location_mode": "quiet_desk",
            "deadline_minutes": 45,
            "previous_energy": 72,
            "previous_battery": 72,
            "previous_location": "quiet_desk",
        }
        body.update(overrides)
        return body

    def test_health_and_home_load(self) -> None:
        self.assertEqual(self.client.get("/api/health").json()["status"], "ok")
        home = self.client.get("/")
        self.assertEqual(home.status_code, 200)
        self.assertIn("Mutate State", home.text)

    def test_deterministic_low_energy_mutation_creates_three_steps_and_actuation(self) -> None:
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            response = self.client.post("/api/mutate", json=self.payload(energy=24, previous_energy=72, previous_battery=71, typing_fatigue=74, noise_dbfs=-17, location_mode="noisy_cafe"))
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["source"], "deterministic_demo")
        self.assertTrue(result["low_capacity"])
        self.assertEqual(result["plan"]["mode"], "micro-sprint")
        self.assertEqual(len(result["plan"]["steps"]), 3)
        self.assertEqual(result["shadow_worker"]["status"], "Shadow Worker PR drafted")
        self.assertEqual(result["apple_payload"]["airpods"]["noise_control"], "Noise Cancellation")
        self.assertEqual(result["apple_payload"]["apple_watch"]["haptic"], "tap")
        self.assertEqual(len(result["schedule"]), 4)
        self.assertIn("dropped", result["transition_summary"])

    def test_high_capacity_keeps_shadow_worker_standing_by(self) -> None:
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            response = self.client.post("/api/mutate", json=self.payload())
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertFalse(result["low_capacity"])
        self.assertEqual(result["shadow_worker"]["status"], "Shadow Worker standing by")
        self.assertEqual(result["plan"]["mode"], "steady-flow")

    def test_transit_payload_uses_transparency(self) -> None:
        request = app.MutationRequest(**self.payload(location_mode="in_transit", energy=20, typing_fatigue=82))
        battery = app.compute_battery(request.energy, request.noise_dbfs, request.typing_fatigue, request.location_mode, request.deadline_minutes)
        preview = app.apple_payload(request, battery, True, "Context changed")
        self.assertEqual(preview["airpods"]["noise_control"], "Transparency")
        self.assertEqual(preview["dynamic_island"]["state"], "recovery_prompt")
        self.assertEqual(preview["delivery"], "preview_only_no_device_connected")

    def test_structured_outputs_path_uses_sdk_parser_and_same_schema(self) -> None:
        request = app.MutationRequest(**self.payload(energy=22, typing_fatigue=75, noise_dbfs=-17))
        parsed = app.deterministic_plan(request, 30)

        class Responses:
            def parse(self, **kwargs: object) -> SimpleNamespace:
                self.kwargs = kwargs
                return SimpleNamespace(output_parsed=parsed)

        responses = Responses()
        client = SimpleNamespace(responses=responses)
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "OPENAI_MODEL": "gpt-6-astra"}), patch.object(app, "create_openai_client", return_value=client):
            result = app.mutate(request)
        self.assertEqual(result["source"], "openai")
        self.assertIs(responses.kwargs["text_format"], app.FocusPlan)
        self.assertIn("Typing fatigue: 75/100", responses.kwargs["input"][1]["content"])

    def test_openai_failure_returns_deterministic_plan(self) -> None:
        class Responses:
            def parse(self, **_: object) -> None:
                raise RuntimeError("offline")

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}), patch.object(app, "create_openai_client", return_value=SimpleNamespace(responses=Responses())):
            request = app.MutationRequest(**self.payload(energy=20, typing_fatigue=80))
            result = app.mutate(request)
        self.assertEqual(result["source"], "deterministic_fallback")
        self.assertEqual(len(result["plan"]["steps"]), 3)

    def test_invalid_location_and_out_of_range_values_are_rejected(self) -> None:
        bad = self.payload(energy=101)
        response = self.client.post("/api/mutate", json=bad)
        self.assertEqual(response.status_code, 422)
        bad_location = self.payload(location_mode="moon_base")
        self.assertEqual(self.client.post("/api/mutate", json=bad_location).status_code, 422)

    def test_structured_output_schema_is_closed_and_exactly_three_steps(self) -> None:
        schema = app.FocusPlan.model_json_schema()
        self.assertFalse(schema["additionalProperties"])
        steps = schema["properties"]["steps"]
        self.assertEqual(steps["minItems"], 3)
        self.assertEqual(steps["maxItems"], 3)


if __name__ == "__main__":
    unittest.main()
