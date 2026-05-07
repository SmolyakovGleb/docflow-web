from __future__ import annotations

NOTIFICATION_STUB_DETAIL = "Bitrix24 notification delivery is deferred until post-MVP"


async def notify(event: str, payload: dict) -> None:
    _ = (event, payload)
    return None
