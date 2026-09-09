"""One chat generation at a time — Ask and Learn share the GPU."""

from __future__ import annotations

import asyncio

generation_semaphore = asyncio.Semaphore(1)
