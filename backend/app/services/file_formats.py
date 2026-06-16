from pathlib import PurePosixPath

MARKDOWN_SUFFIXES = {".md"}
YAML_SUFFIXES = {".yaml", ".yml"}
TRANSLATABLE_SUFFIXES = MARKDOWN_SUFFIXES | YAML_SUFFIXES

# The YAML pipeline only supports Bitrix24 TOC files (b24-toc.yaml/.yml).
# Other YAML files would always fail downstream, so reject them up front.
SUPPORTED_YAML_NAMES = {"b24-toc.yaml", "b24-toc.yml"}


def is_translatable_path(path: str) -> bool:
    pure = PurePosixPath(path.lower())
    suffix = pure.suffix
    if suffix in MARKDOWN_SUFFIXES:
        return True
    if suffix in YAML_SUFFIXES:
        return pure.name in SUPPORTED_YAML_NAMES
    return False


def is_yaml_path(path: str) -> bool:
    return PurePosixPath(path.lower()).suffix in YAML_SUFFIXES


def is_safe_relative_path(path: str) -> bool:
    """True если path — безопасный относительный forward-slash путь без traversal.

    Отвергает абсолютные пути, обратные слэши и сегменты '', '.', '..'.
    Используется и для входящих webhook-путей, и для ручного API (там же
    оборачивается в HTTP 400).
    """
    if not path or path.startswith("/") or "\\" in path:
        return False
    return not any(part in {"", "..", "."} for part in path.split("/"))


def translatable_error_text() -> str:
    return "Only .md files and b24-toc.yaml/.yml files are allowed"
