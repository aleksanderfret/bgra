#!/usr/bin/env python3
"""Run cz --hook as the tty foreground group so Ctrl+C does not reach git/husky.

macOS /usr/bin/python3 is 3.9: tcsetpgrp lives on `os`, not `termios`.
"""

from __future__ import annotations

import os
import signal
import sys


def _foreground(fd: int, pgid: int) -> None:
    try:
        os.tcsetpgrp(fd, pgid)
    except OSError:
        pass


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: run-cz-hook.py <cz-bin>", file=sys.stderr)
        return 2

    cz = sys.argv[1]
    tty = os.open("/dev/tty", os.O_RDWR)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTTOU, signal.SIG_IGN)

    pid = os.fork()
    if pid == 0:
        os.setpgrp()
        _foreground(tty, os.getpgrp())
        os.dup2(tty, 0)
        os.dup2(tty, 1)
        os.dup2(tty, 2)
        os.execv(cz, [cz, "--hook"])
        os._exit(127)

    os.setpgid(pid, pid)
    _foreground(tty, pid)
    _id, status = os.waitpid(pid, 0)
    _foreground(tty, os.getpgrp())
    os.close(tty)

    if os.WIFSIGNALED(status):
        return 130
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
