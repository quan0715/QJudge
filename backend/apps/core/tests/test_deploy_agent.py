"""The deploy agent client must name why the agent is unavailable and never leak its token.

Plain unittest on purpose: pytest-django sets up a database for every Django test
class, and nothing here touches one.
"""

import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import httpx
from django.test import override_settings

from apps.core.services.deploy_agent import (
    AgentBusy,
    AgentTargetNotLatest,
    AgentUnavailable,
    agent_check_updates,
    agent_containers,
    agent_ingress,
    agent_start_upgrade,
    agent_status,
)

AGENT_URL = "http://agent:8090"
STATUS = {"version": {}, "job": None, "log": "", "external_busy": False}


class DeployAgentClientTests(unittest.TestCase):
    @contextmanager
    def agent(self, *, status_code=200, json=None, side_effect=None, token="t0ken"):
        """Point the client at a fake agent: a token file plus a patched httpx.request."""
        with tempfile.TemporaryDirectory() as directory:
            token_file = Path(directory) / "agent-token"
            if token is not None:
                token_file.write_text(f"{token}\n")
            with override_settings(
                QJUDGE_AGENT_URL=AGENT_URL, QJUDGE_AGENT_TOKEN_FILE=str(token_file)
            ), patch(
                "httpx.request",
                side_effect=side_effect,
                return_value=None if side_effect else httpx.Response(status_code, json=json),
            ) as request:
                yield request

    def assertUnavailable(self, state, call, *args):
        with self.assertRaises(AgentUnavailable) as caught:
            call(*args)
        self.assertEqual(caught.exception.state, state)
        return caught.exception

    @override_settings(QJUDGE_AGENT_URL="")
    def test_empty_url_means_unsupported(self):
        with patch("httpx.request") as request:
            self.assertUnavailable("unsupported", agent_status)
        request.assert_not_called()

    def test_connection_error_means_unreachable(self):
        with self.agent(side_effect=httpx.ConnectError("refused")):
            error = self.assertUnavailable("unreachable", agent_status)
        self.assertIn("refused", error.detail)

    def test_timeout_means_unreachable(self):
        with self.agent(side_effect=httpx.ReadTimeout("slow")):
            self.assertUnavailable("unreachable", agent_status)

    def test_missing_token_file_means_unreachable_without_calling_the_agent(self):
        with self.agent(token=None, json=STATUS) as request:
            self.assertUnavailable("unreachable", agent_status)
        request.assert_not_called()

    def test_blank_token_file_means_unreachable_without_calling_the_agent(self):
        with self.agent(token="  ", json=STATUS) as request:
            self.assertUnavailable("unreachable", agent_status)
        request.assert_not_called()

    def test_rejected_token_means_unreachable(self):
        with self.agent(status_code=401, json={"error": "unauthorized"}):
            self.assertUnavailable("unreachable", agent_status)

    def test_server_errors_mean_unreachable_and_keep_the_agent_detail(self):
        with self.agent(status_code=503, json={"error": "unavailable", "detail": "docker is down"}):
            error = self.assertUnavailable("unreachable", agent_status)
        self.assertIn("docker is down", error.detail)
        with self.agent(status_code=500, json={"error": "internal"}):
            self.assertUnavailable("unreachable", agent_status)

    def test_an_answer_that_is_not_json_means_unreachable(self):
        with self.agent() as request:
            request.return_value = httpx.Response(200, text="<html>proxy</html>")
            self.assertUnavailable("unreachable", agent_status)

    def test_requests_carry_the_token(self):
        with self.agent(json=STATUS) as request:
            self.assertEqual(agent_status(), STATUS)
        self.assertEqual(request.call_args.kwargs["headers"]["Authorization"], "Bearer t0ken")
        self.assertEqual(request.call_args.args, ("GET", f"{AGENT_URL}/v1/status"))

    def test_a_trailing_slash_in_the_url_is_tolerated(self):
        with self.agent(json=STATUS) as request, override_settings(QJUDGE_AGENT_URL=f"{AGENT_URL}/"):
            agent_status()
        self.assertEqual(request.call_args.args[1], f"{AGENT_URL}/v1/status")

    def test_reads_use_the_short_timeout_and_slow_probes_the_long_one(self):
        with self.agent(json=STATUS) as request:
            agent_status()
        self.assertEqual(request.call_args.kwargs["timeout"], 5.0)
        with self.agent(json={"containers": []}) as request:
            agent_containers()
        self.assertEqual(request.call_args.kwargs["timeout"], 5.0)
        with self.agent(json={"latest": {}, "releases": [], "update_available": False}) as request:
            agent_check_updates()
        self.assertEqual(request.call_args.args, ("POST", f"{AGENT_URL}/v1/check"))
        self.assertEqual(request.call_args.kwargs["timeout"], 30.0)
        with self.agent(json={"entries": []}) as request:
            agent_ingress()
        self.assertEqual(request.call_args.kwargs["timeout"], 30.0)

    def test_containers_and_ingress_unwrap_their_lists(self):
        item = {"project": "qjudge", "service": "backend", "state": "running", "health": "healthy"}
        with self.agent(json={"containers": [item]}):
            self.assertEqual(agent_containers(), [item])
        entry = {"id": "web", "public": "https://x", "target": "frontend", "probe": "/", "ok": True, "detail": ""}
        with self.agent(json={"entries": [entry]}):
            self.assertEqual(agent_ingress(), [entry])

    def test_a_list_answer_of_the_wrong_shape_means_unreachable(self):
        with self.agent(json={"containers": "nope"}):
            self.assertUnavailable("unreachable", agent_containers)
        with self.agent(json={}):
            self.assertUnavailable("unreachable", agent_ingress)

    def test_upgrade_posts_target_and_actor(self):
        job = {"id": "j", "status": "running"}
        with self.agent(status_code=202, json=job) as request:
            self.assertEqual(agent_start_upgrade("b" * 40, "root"), job)
        self.assertEqual(request.call_args.args, ("POST", f"{AGENT_URL}/v1/upgrade"))
        self.assertEqual(request.call_args.kwargs["json"], {"target": "b" * 40, "triggered_by": "root"})

    def test_upgrade_maps_busy_and_not_latest(self):
        with self.agent(status_code=409, json={"error": "busy"}), self.assertRaises(AgentBusy):
            agent_start_upgrade("b" * 40, "root")
        with self.agent(status_code=400, json={"error": "not_latest", "latest": "c" * 40}), \
                self.assertRaises(AgentTargetNotLatest) as caught:
            agent_start_upgrade("b" * 40, "root")
        self.assertEqual(caught.exception.latest, "c" * 40)

    def test_upgrade_the_agent_cannot_understand_means_unreachable(self):
        with self.agent(status_code=400, json={"error": "bad_request"}):
            self.assertUnavailable("unreachable", agent_start_upgrade, "b" * 40, "root")
