from __future__ import annotations

from app.api.routes.webhook import _collect_translatable_files
from app.services.webhook import build_github_signature, is_valid_github_signature


def test_hmac_valid():
    body = b'{"zen":"Keep it logically awesome."}'
    secret = "webhook-secret"
    signature = build_github_signature(secret, body)

    assert is_valid_github_signature(secret, body, signature) is True


def test_hmac_invalid():
    body = b'{"ref":"refs/heads/main"}'

    assert is_valid_github_signature("webhook-secret", body, "sha256=invalid") is False


def test_hmac_timing_safe(mocker):
    compare_digest = mocker.patch("app.services.webhook.hmac.compare_digest", return_value=False)
    body = b"payload"

    assert is_valid_github_signature("webhook-secret", body, "sha256=x") is False
    compare_digest.assert_called_once()

    expected_signature = build_github_signature("webhook-secret", body)
    received_signature = "sha256=x"
    assert compare_digest.call_args == mocker.call(expected_signature, received_signature)


def test_collect_translatable_files_drops_path_traversal():
    payload = {
        "commits": [
            {
                "added": ["api-reference/crm/b24-toc.yaml", "../../../tmp/b24-toc.yaml"],
                "modified": ["docs/index.md", "/etc/passwd.md"],
            }
        ]
    }

    files = _collect_translatable_files(payload)

    assert "api-reference/crm/b24-toc.yaml" in files
    assert "docs/index.md" in files
    # traversal и абсолютные пути должны быть отброшены
    assert "../../../tmp/b24-toc.yaml" not in files
    assert "/etc/passwd.md" not in files
