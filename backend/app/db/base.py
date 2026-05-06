from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def _register_models() -> None:
    import app.models  # noqa: F401


_register_models()
