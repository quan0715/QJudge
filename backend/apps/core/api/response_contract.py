"""Permanent JSON boundary for audited actions; file/protocol actions stay separate."""
from rest_framework.response import Response
from .renderer import ContractJSONRenderer


class JSONContractMixin:
    json_contract_actions = frozenset()

    @property
    def api_contract_enabled(self):
        return getattr(self, 'action', None) in self.json_contract_actions

    def initial(self, request, *args, **kwargs):
        # Django's framework 500 handler executes outside the DRF view.
        request._request.api_contract_enabled = self.api_contract_enabled
        return super().initial(request, *args, **kwargs)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if self.api_contract_enabled and isinstance(response, Response):
            response.accepted_renderer = ContractJSONRenderer()
            response.accepted_media_type = 'application/json'
        return response
