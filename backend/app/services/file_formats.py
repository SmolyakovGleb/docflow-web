from pathlib import PurePosixPath

TRANSLATABLE_SUFFIXES = {".md", ".yaml", ".yml"}
YAML_SUFFIXES = {".yaml", ".yml"}


def is_translatable_path(path: str) -> bool:
    return PurePosixPath(path.lower()).suffix in TRANSLATABLE_SUFFIXES


def is_yaml_path(path: str) -> bool:
    return PurePosixPath(path.lower()).suffix in YAML_SUFFIXES


def translatable_error_text() -> str:
    return "Only .md, .yaml and .yml files are allowed"
