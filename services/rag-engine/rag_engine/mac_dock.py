"""Keep the long-lived engine process off the macOS Dock."""

from __future__ import annotations

import logging
import sys

logger = logging.getLogger(__name__)

# kProcessTransformToBackgroundApplication — no Dock tile, no bounce.
_BACKGROUND = 2


def _running_on_macos() -> bool:
    # Function boundary so mypy on Linux does not mark the darwin body unreachable.
    return sys.platform == "darwin"


def hide_cli_from_macos_dock() -> None:
    """Turn this process into a background app so macOS does not show a black 'exec' Dock icon.

    Electron starts the engine as a bare CLI (`uv` → `python`). Without this,
    Launch Services treats that Python as a normal app and blinks a blank tile
    for the whole session. TransformProcessType alone is not enough: a process
    that never finishes launching stays `!signalled` and the Dock keeps bouncing.
    """
    if not _running_on_macos():
        return
    try:
        import ctypes
        from ctypes import Structure, byref, c_int, c_uint32

        class ProcessSerialNumber(Structure):
            _fields_ = [("highLongOfPSN", c_uint32), ("lowLongOfPSN", c_uint32)]

        lib = ctypes.cdll.LoadLibrary(
            "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
        )
        lib.GetCurrentProcess.argtypes = [ctypes.POINTER(ProcessSerialNumber)]
        lib.GetCurrentProcess.restype = c_int
        lib.TransformProcessType.argtypes = [ctypes.POINTER(ProcessSerialNumber), c_uint32]
        lib.TransformProcessType.restype = c_int

        psn = ProcessSerialNumber(0, 0)
        if lib.GetCurrentProcess(byref(psn)) == 0:
            lib.TransformProcessType(byref(psn), c_uint32(_BACKGROUND))
        _finish_launching_as_background()
    except Exception:
        logger.debug("Could not hide the engine from the Dock", exc_info=True)


def _finish_launching_as_background() -> None:
    import ctypes
    from ctypes import c_int64, c_void_p

    ctypes.cdll.LoadLibrary("/System/Library/Frameworks/AppKit.framework/AppKit")
    libobjc = ctypes.cdll.LoadLibrary("/usr/lib/libobjc.A.dylib")
    libobjc.objc_getClass.restype = c_void_p
    libobjc.objc_getClass.argtypes = [ctypes.c_char_p]
    libobjc.sel_registerName.restype = c_void_p
    libobjc.sel_registerName.argtypes = [ctypes.c_char_p]
    msg = libobjc.objc_msgSend
    msg.restype = c_void_p
    msg.argtypes = [c_void_p, c_void_p]
    shared = msg(
        libobjc.objc_getClass(b"NSApplication"),
        libobjc.sel_registerName(b"sharedApplication"),
    )
    if not shared:
        return
    msg.restype = c_int64
    msg.argtypes = [c_void_p, c_void_p, c_int64]
    msg(shared, libobjc.sel_registerName(b"setActivationPolicy:"), 2)
    msg.restype = c_void_p
    msg.argtypes = [c_void_p, c_void_p]
    msg(shared, libobjc.sel_registerName(b"finishLaunching"))
