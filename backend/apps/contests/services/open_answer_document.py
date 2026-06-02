"""Validation and serialization for structured open-answer documents."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from rest_framework.exceptions import ValidationError


ALLOWED_NODE_TYPES = {"paragraph"}
ALLOWED_INLINE_TYPES = {"text", "math"}

EMPTY_OPEN_ANSWER_DOCUMENT = {
    "version": 1,
    "nodes": [
        {
            "type": "paragraph",
            "children": [],
        },
    ],
}


@dataclass(frozen=True)
class OpenAnswerSerialized:
    plain_text: str
    grading_text: str


def validate_open_answer_document(value: Any) -> dict:
    """Validate an OpenAnswerDocument and return it unchanged."""
    if not isinstance(value, dict):
        raise ValidationError("open answer document must be an object")
    if value.get("version") != 1:
        raise ValidationError("open answer document version must be 1")
    nodes = value.get("nodes")
    if not isinstance(nodes, list):
        raise ValidationError("open answer document nodes must be an array")
    for index, node in enumerate(nodes):
        _validate_node(node, f"nodes[{index}]")
    return value


def serialize_open_answer_document(value: dict) -> OpenAnswerSerialized:
    """Serialize an OpenAnswerDocument into fallback and grading text views."""
    document = validate_open_answer_document(value)
    lines: list[str] = []
    for node in document["nodes"]:
        lines.append(_serialize_inline_nodes(node.get("children", [])))
    text = "\n".join(lines).strip()
    return OpenAnswerSerialized(plain_text=text, grading_text=text)


def _validate_node(node: Any, path: str) -> None:
    if not isinstance(node, dict):
        raise ValidationError(f"{path} must be an object")
    if node.get("type") not in ALLOWED_NODE_TYPES:
        raise ValidationError(f"{path}.type is invalid")
    children = node.get("children")
    if not isinstance(children, list):
        raise ValidationError(f"{path}.children must be an array")
    for index, child in enumerate(children):
        _validate_inline_node(child, f"{path}.children[{index}]")


def _validate_inline_node(node: Any, path: str) -> None:
    if not isinstance(node, dict):
        raise ValidationError(f"{path} must be an object")
    node_type = node.get("type")
    if node_type not in ALLOWED_INLINE_TYPES:
        raise ValidationError(f"{path}.type is invalid")
    if node_type == "text":
        if not isinstance(node.get("text", ""), str):
            raise ValidationError(f"{path}.text must be a string")
        return
    # math
    if not isinstance(node.get("latex"), str):
        raise ValidationError(f"{path}.latex must be a string")


def _serialize_inline_nodes(nodes: list[dict]) -> str:
    return "".join(_serialize_inline_node(node) for node in nodes)


def _serialize_inline_node(node: dict) -> str:
    if node.get("type") == "text":
        return node.get("text", "")
    if node.get("type") == "math":
        return f"${node.get('latex', '')}$"
    return ""
