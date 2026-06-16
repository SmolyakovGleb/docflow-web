from app.services.file_formats import (
    is_safe_relative_path,
    is_translatable_path,
    is_yaml_path,
    translatable_error_text,
)


def test_translatable_paths_include_markdown_and_b24_toc_yaml() -> None:
    assert is_translatable_path("docs/index.md")
    assert is_translatable_path("api-reference/tasks/b24-toc.yaml")
    assert is_translatable_path("api-reference/tasks/b24-toc.yml")
    assert not is_translatable_path("docs/data.json")


def test_non_b24_toc_yaml_is_not_translatable() -> None:
    # The YAML pipeline only supports b24-toc.yaml/.yml; other YAML files would
    # always fail downstream, so they must not produce tasks.
    assert not is_translatable_path("docs/config.yaml")
    assert not is_translatable_path("openapi.yml")
    assert not is_translatable_path("b24-toc-extra.yaml")


def test_yaml_path_detection_is_suffix_only() -> None:
    assert is_yaml_path("api-reference/tasks/b24-toc.yaml")
    assert is_yaml_path("api-reference/tasks/b24-toc.yml")
    assert is_yaml_path("docs/config.yaml")
    assert not is_yaml_path("docs/index.md")


def test_error_text_lists_supported_formats() -> None:
    assert translatable_error_text() == "Only .md files and b24-toc.yaml/.yml files are allowed"


def test_safe_relative_path_accepts_normal_paths() -> None:
    assert is_safe_relative_path("docs/index.md")
    assert is_safe_relative_path("api-reference/tasks/b24-toc.yaml")
    assert is_safe_relative_path("file.md")


def test_safe_relative_path_rejects_traversal_and_absolute() -> None:
    # Path traversal — основной вектор: ../ уводит запись за пределы workspace.
    assert not is_safe_relative_path("../../../tmp/b24-toc.yaml")
    assert not is_safe_relative_path("docs/../../etc/passwd")
    assert not is_safe_relative_path("/etc/b24-toc.yaml")
    assert not is_safe_relative_path("docs\\b24-toc.yaml")
    assert not is_safe_relative_path("./b24-toc.yaml")
    assert not is_safe_relative_path("")
