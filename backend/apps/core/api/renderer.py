"""Strict success boundary for migrated application JSON endpoints."""
from rest_framework.renderers import JSONRenderer


class ContractJSONRenderer(JSONRenderer):
    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = (renderer_context or {}).get("response")
        status_code = response.status_code if response is not None else 200
        if 200 <= status_code < 300:
            if status_code == 204 and response is not None:
                response.status_code = 200
            meta = {}
            if isinstance(data, dict) and {"count", "next", "previous", "results"} <= data.keys():
                meta["pagination"] = {key: data[key] for key in ("count", "next", "previous")}
                data = data["results"]
            data = {"data": data, "meta": meta}
        return super().render(data, accepted_media_type, renderer_context)
