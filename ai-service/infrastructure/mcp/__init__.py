"""MCP credential and readiness adapters.

Adapters are intentionally imported from their concrete modules so reading a
Redis lease does not eagerly import the LangChain runtime.
"""
