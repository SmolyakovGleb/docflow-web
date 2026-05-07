from __future__ import annotations

from app.services import bitrix_notify
from app.services.bitrix_notify import NOTIFICATION_STUB_DETAIL as STUB_DETAIL


async def test_get_notification_channels_returns_empty_list(auth_client):
    response = await auth_client.get("/notifications/channels")

    assert response.status_code == 200
    assert response.json() == []


async def test_notification_write_endpoints_return_501(auth_client):
    post_response = await auth_client.post(
        "/notifications/channels",
        json={
            "name": "Errors",
            "method": "incoming_webhook",
            "webhook_url": "https://example.test/hook",
            "events": ["failure"],
        },
    )
    patch_response = await auth_client.patch(
        "/notifications/channels/550e8400-e29b-41d4-a716-446655440000",
        json={"name": "Updated"},
    )
    delete_response = await auth_client.delete(
        "/notifications/channels/550e8400-e29b-41d4-a716-446655440000"
    )
    test_response = await auth_client.post(
        "/notifications/channels/550e8400-e29b-41d4-a716-446655440000/test"
    )

    expected = {"detail": STUB_DETAIL}
    assert post_response.status_code == 501
    assert post_response.json() == expected
    assert patch_response.status_code == 501
    assert patch_response.json() == expected
    assert delete_response.status_code == 501
    assert delete_response.json() == expected
    assert test_response.status_code == 501
    assert test_response.json() == expected


async def test_bitrix_notify_is_noop():
    result = await bitrix_notify.notify(
        "published",
        {"task_id": "550e8400-e29b-41d4-a716-446655440000"},
    )

    assert result is None
