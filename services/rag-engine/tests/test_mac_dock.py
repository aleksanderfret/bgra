from __future__ import annotations

import sys

import pytest

from rag_engine.mac_dock import hide_cli_from_macos_dock


def test_hide_cli_from_macos_dock_is_noop_off_darwin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "platform", "linux")
    hide_cli_from_macos_dock()


@pytest.mark.skipif(sys.platform != "darwin", reason="macOS Dock transform only")
def test_hide_cli_from_macos_dock_does_not_raise_on_darwin() -> None:
    hide_cli_from_macos_dock()
