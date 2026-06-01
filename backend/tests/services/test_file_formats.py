from app.services.file_formats import (
    is_translatable_path,
    is_yaml_path,
    translatable_error_text,
)


def test_translatable_paths_include_markdown_and_yaml() -> None:
    assert is_translatable_path("docs/index.md")
    assert is_translatable_path("api-reference/tasks/b24-toc.yaml")
    assert is_translatable_path("api-reference/tasks/b24-toc.yml")
    assert not is_translatable_path("docs/data.json")


def test_yaml_path_detection() -> None:
    assert is_yaml_path("api-reference/tasks/b24-toc.yaml")
    assert is_yaml_path("api-reference/tasks/b24-toc.yml")
    assert not is_yaml_path("docs/index.md")


def test_error_text_lists_supported_formats() -> None:
    assert translatable_error_text() == "Only .md, .yaml and .yml files are allowed"
