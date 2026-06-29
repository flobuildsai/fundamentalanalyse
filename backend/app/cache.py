"""Async RawFinancials cache used by the API layer."""

from __future__ import annotations

import asyncio
import math
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from app.valuation import RawFinancials


def _env_float(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, ""))
    except ValueError:
        return default
    return value if math.isfinite(value) else default


def cache_ttl_seconds_from_env() -> float:
    """Return the configured API-level RawFinancials cache TTL."""

    return max(0.0, _env_float("CACHE_TTL_SECONDS", 1800.0))


@dataclass(frozen=True)
class _CacheEntry:
    raw: RawFinancials
    stored_at: datetime


class RawFinancialsCache:
    """Small asyncio-safe TTL cache with per-key single-flight fetching."""

    def __init__(self, ttl_seconds: float | None = None) -> None:
        self.ttl_seconds = cache_ttl_seconds_from_env() if ttl_seconds is None else ttl_seconds
        self._items: dict[tuple[str, str], _CacheEntry] = {}
        self._locks: dict[tuple[str, str], asyncio.Lock] = {}
        self._guard = asyncio.Lock()

    async def get_or_fetch(
        self,
        provider_key: str,
        ticker: str,
        fetch: Callable[[], Awaitable[RawFinancials]],
    ) -> tuple[RawFinancials, bool]:
        """Return cached fundamentals or fetch them once for concurrent callers."""

        if self.ttl_seconds <= 0:
            return await fetch(), False

        key = (provider_key.strip().lower(), ticker.strip().upper())
        cached = await self._get_fresh(key)
        if cached is not None:
            return cached, True

        lock = await self._lock_for(key)
        async with lock:
            cached = await self._get_fresh(key)
            if cached is not None:
                return cached, True

            raw = await fetch()
            await self._set(key, raw)
            return raw, False

    async def clear(self) -> None:
        """Clear cached values and per-key locks."""

        async with self._guard:
            self._items.clear()
            self._locks.clear()

    async def _get_fresh(self, key: tuple[str, str]) -> RawFinancials | None:
        async with self._guard:
            entry = self._items.get(key)
            if entry is None:
                return None

            age = (datetime.now(UTC) - entry.stored_at).total_seconds()
            if age > self.ttl_seconds:
                self._items.pop(key, None)
                return None

            return entry.raw

    async def _set(self, key: tuple[str, str], raw: RawFinancials) -> None:
        async with self._guard:
            self._items[key] = _CacheEntry(raw=raw, stored_at=datetime.now(UTC))

    async def _lock_for(self, key: tuple[str, str]) -> asyncio.Lock:
        async with self._guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
            return lock
