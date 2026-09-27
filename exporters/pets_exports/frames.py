"""Rendered persona input shared by image export adapters."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RenderedPersona:
    identifier: str
    name: str
    version: str
    cell: tuple[int, int]
    states: dict[str, int]
    durations: dict[str, int]
    source_blend_sha256: str
