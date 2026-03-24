"""Gateway router for IM channel management."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/channels", tags=["channels"])


class ChannelStatusResponse(BaseModel):
    service_running: bool
    channels: dict[str, dict]


class ChannelRestartResponse(BaseModel):
    success: bool
    message: str


class ChannelOngoingThreadResponse(BaseModel):
    channel_name: str
    chat_id: str
    thread_id: str
    source: str


def _telegram_allowed_chat_ids() -> list[str]:
    from src.config.app_config import get_app_config

    config = get_app_config()
    extra = config.model_extra or {}
    channels = extra.get("channels") or {}
    telegram = channels.get("telegram") if isinstance(channels, dict) else {}
    allowed_users = telegram.get("allowed_users") if isinstance(telegram, dict) else []
    return [str(value) for value in allowed_users or [] if value is not None]


def _pick_latest_entry(entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not entries:
        return None
    return max(entries, key=lambda item: float(item.get("updated_at") or 0))


@router.get("/telegram/ongoing-thread", response_model=ChannelOngoingThreadResponse)
async def get_telegram_ongoing_thread() -> ChannelOngoingThreadResponse:
    """Return the canonical ongoing Telegram thread, creating or healing it if needed."""
    from langgraph_sdk import get_client

    from src.channels.store import ChannelStore
    from src.config.app_config import get_app_config

    store = ChannelStore()
    allowed_chat_ids = _telegram_allowed_chat_ids()
    entries = store.list_entries("telegram")
    base_entries = [entry for entry in entries if not entry.get("topic_id")]

    preferred: dict[str, Any] | None = None
    source = "store_private_topic_mapping"

    for chat_id in allowed_chat_ids:
        private_entry = next(
            (
                entry
                for entry in entries
                if entry.get("chat_id") == chat_id and str(entry.get("topic_id") or "") == chat_id
            ),
            None,
        )
        if private_entry:
            preferred = private_entry
            break

    if preferred is None:
        source = "promoted_latest_topic_mapping"
        for chat_id in allowed_chat_ids:
            topic_entries = [entry for entry in entries if entry.get("chat_id") == chat_id]
            preferred = _pick_latest_entry(topic_entries)
            if preferred:
                store.set_thread_id(
                    "telegram",
                    chat_id,
                    preferred["thread_id"],
                    topic_id=chat_id,
                    user_id=preferred.get("user_id") or chat_id,
                )
                preferred = {**preferred, "chat_id": chat_id, "topic_id": chat_id}
                break

    if preferred is None:
        source = "store_base_mapping"
        for chat_id in allowed_chat_ids:
            preferred = next((entry for entry in base_entries if entry.get("chat_id") == chat_id), None)
            if preferred:
                store.set_thread_id(
                    "telegram",
                    chat_id,
                    preferred["thread_id"],
                    topic_id=chat_id,
                    user_id=preferred.get("user_id") or chat_id,
                )
                preferred = {**preferred, "chat_id": chat_id, "topic_id": chat_id}
                break

    if preferred is None:
        chat_id = allowed_chat_ids[0] if allowed_chat_ids else None
        if not chat_id:
            raise HTTPException(status_code=404, detail="No Telegram chat is configured for an ongoing thread")

        config = get_app_config()
        extra = config.model_extra or {}
        channels = extra.get("channels") or {}
        langgraph_url = channels.get("langgraph_url", "http://localhost:2024") if isinstance(channels, dict) else "http://localhost:2024"
        client = get_client(url=langgraph_url)
        thread = await client.threads.create()
        store.set_thread_id("telegram", chat_id, thread["thread_id"], user_id=chat_id)
        preferred = {"chat_id": chat_id, "thread_id": thread["thread_id"]}
        source = "created_base_mapping"

    return ChannelOngoingThreadResponse(
        channel_name="telegram",
        chat_id=str(preferred["chat_id"]),
        thread_id=str(preferred["thread_id"]),
        source=source,
    )


@router.get("/", response_model=ChannelStatusResponse)
async def get_channels_status() -> ChannelStatusResponse:
    """Get the status of all IM channels."""
    from src.channels.service import get_channel_service

    service = get_channel_service()
    if service is None:
        return ChannelStatusResponse(service_running=False, channels={})
    status = service.get_status()
    return ChannelStatusResponse(**status)


@router.post("/{name}/restart", response_model=ChannelRestartResponse)
async def restart_channel(name: str) -> ChannelRestartResponse:
    """Restart a specific IM channel."""
    from src.channels.service import get_channel_service

    service = get_channel_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Channel service is not running")

    success = await service.restart_channel(name)
    if success:
        logger.info("Channel %s restarted successfully", name)
        return ChannelRestartResponse(success=True, message=f"Channel {name} restarted successfully")
    else:
        logger.warning("Failed to restart channel %s", name)
        return ChannelRestartResponse(success=False, message=f"Failed to restart channel {name}")
