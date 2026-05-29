"""CLI commands for DocFlow administration.

Usage:
    python -m app.cli create-admin --email admin@example.com --password secret123
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.db.session import get_session_factory
from app.models.user import User
from app.services.auth import hash_password


async def _create_admin(email: str, password: str) -> None:
    async with get_session_factory()() as session:
        existing = await session.scalar(select(User).where(User.email == email))
        if existing is not None:
            if existing.is_admin:
                print(f"User {email} already exists and is already an admin.")
                return
            existing.is_admin = True
            await session.commit()
            print(f"Granted admin to existing user {email}.")
            return

        user = User(
            email=email,
            password_hash=hash_password(password),
            is_admin=True,
        )
        session.add(user)
        await session.commit()
        print(f"Admin user {email} created successfully.")


def main() -> None:
    parser = argparse.ArgumentParser(description="DocFlow CLI")
    subparsers = parser.add_subparsers(dest="command")

    create_admin = subparsers.add_parser("create-admin", help="Create or promote an admin user")
    create_admin.add_argument("--email", required=True, help="Admin email")
    create_admin.add_argument(
        "--password", required=True, help="Admin password (min 8 chars, 1 digit)"
    )

    args = parser.parse_args()

    if args.command == "create-admin":
        if len(args.password) < 8 or not any(c.isdigit() for c in args.password):
            print("Error: password must be at least 8 characters and contain at least one digit.")
            sys.exit(1)
        asyncio.run(_create_admin(args.email, args.password))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
