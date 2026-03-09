"""
Custom LoadTestShape: ramp 0→50→100→150→200 over 4 minutes,
then hold steady for 10 minutes.

Total duration: ~14 minutes.
"""
from locust import LoadTestShape


class SteppedLoadShape(LoadTestShape):
    """
    Stepped ramp-up then steady state.

    Stages:
      0-60s   → 50 users  (spawn 5/s)
      60-120s → 100 users (spawn 5/s)
      120-180s → 150 users (spawn 5/s)
      180-240s → 200 users (spawn 5/s)
      240-840s → 200 users (steady)
    """
    stages = [
        {"duration": 60, "users": 50, "spawn_rate": 5},
        {"duration": 120, "users": 100, "spawn_rate": 5},
        {"duration": 180, "users": 150, "spawn_rate": 5},
        {"duration": 240, "users": 200, "spawn_rate": 5},
        {"duration": 840, "users": 200, "spawn_rate": 5},  # steady 10 min
    ]

    def tick(self):
        run_time = self.get_run_time()
        for stage in self.stages:
            if run_time < stage["duration"]:
                return (stage["users"], stage["spawn_rate"])
        return None  # stop
