"""Telegram channel -- connects via long-polling (no public IP needed).

v2.1 (VESPER-14): Added Markdown-to-HTML conversion for proper formatting
in Telegram. VESPER LLM output uses standard Markdown (bold, code, fenced
code blocks, etc.) which Telegram does not render natively. This version
converts to HTML with parse_mode=HTML and includes:
- Fenced code block, inline code, bold, italic, link conversion
- HTML special character escaping
- Fallback to plain text if HTML parsing fails
- Message splitting at safe boundaries for 4096 char limit
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading
from typing import Any

from src.channels.base import Channel
from src.channels.message_bus import (
    InboundMessageType,
    MessageBus,
    OutboundMessage,
    ResolvedAttachment,
)

logger = logging.getLogger(__name__)

# -- Markdown to HTML conversion for Telegram --------------------------------

TELEGRAM_MAX_MESSAGE_LENGTH = 4096
# Use chr(96) to build the triple-backtick string so that this source file
# does not contain a literal triple-backtick (which would break Notion code
# blocks when stored in Code Snippets).
_TICK3 = chr(96) * 3
_CODE_BLOCK_RE = re.compile(_TICK3 + r"(\w*)\n(.*?)" + _TICK3, re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")


def _escape_html(text: str) -> str:
    """Escape HTML special characters in plain text."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _markdown_to_html(text: str) -> str:
    """Convert standard Markdown formatting to Telegram-compatible HTML."""
    if not text:
        return text

    result = []
    last_end = 0
    for match in _CODE_BLOCK_RE.finditer(text):
        before = text[last_end:match.start()]
        result.append(_convert_inline_markdown(before))
        lang = match.group(1)
        code = _escape_html(match.group(2).rstrip("\n"))
        if lang:
            result.append(
                f'<pre><code class="language-{lang}">{code}</code></pre>'
            )
        else:
            result.append(f"<pre><code>{code}</code></pre>")
        last_end = match.end()

    remaining = text[last_end:]
    result.append(_convert_inline_markdown(remaining))
    return "".join(result)


def _convert_inline_markdown(text: str) -> str:
    """Convert inline Markdown (bold, italic, code, links) to HTML."""
    if not text:
        return text

    parts = []
    last_end = 0
    for match in _INLINE_CODE_RE.finditer(text):
        before = text[last_end:match.start()]
        parts.append(_convert_formatting(_escape_html(before)))
        code_content = _escape_html(match.group(1))
        parts.append(f"<code>{code_content}</code>")
        last_end = match.end()

    remaining = text[last_end:]
    parts.append(_convert_formatting(_escape_html(remaining)))
    return "".join(parts)


def _convert_formatting(text: str) -> str:
    """Convert bold, italic, and links in already-HTML-escaped text."""
    if not text:
        return text
    # Links [text](url)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        r'<a href="\2">\1</a>',
        text,
    )
    # Bold **text**
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Italic *text* (not preceded/followed by *)
    text = re.sub(
        r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text
    )
    return text


def _split_html_message(
    html: str, max_length: int = TELEGRAM_MAX_MESSAGE_LENGTH
) -> list[str]:
    """Split HTML message into chunks respecting Telegram max length.

    Splits on newline boundaries to avoid breaking HTML tags.
    """
    if len(html) <= max_length:
        return [html]

    chunks: list[str] = []
    lines = html.split("\n")
    current_chunk: list[str] = []
    current_length = 0

    for line in lines:
        line_len = len(line) + 1
        if current_length + line_len > max_length and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = []
            current_length = 0
        if line_len > max_length:
            words = line.split(" ")
            word_chunk: list[str] = []
            wc_len = 0
            for word in words:
                wl = len(word) + 1
                if wc_len + wl > max_length and word_chunk:
                    if current_chunk:
                        current_chunk.append(" ".join(word_chunk))
                        chunks.append("\n".join(current_chunk))
                        current_chunk = []
                        current_length = 0
                    else:
                        chunks.append(" ".join(word_chunk))
                    word_chunk = []
                    wc_len = 0
                word_chunk.append(word)
                wc_len += wl
            if word_chunk:
                current_chunk.append(" ".join(word_chunk))
                current_length += len(current_chunk[-1]) + 1
        else:
            current_chunk.append(line)
            current_length += line_len

    if current_chunk:
        chunks.append("\n".join(current_chunk))
    return chunks if chunks else [html]


class TelegramChannel(Channel):
    """Telegram bot channel using long-polling.

    Configuration keys (in config.yaml under channels.telegram):
        - bot_token: Telegram Bot API token (from @BotFather).
        - allowed_users: (optional) list of allowed user IDs. Empty = all.
    """

    def __init__(self, bus: MessageBus, config: dict[str, Any]) -> None:
        super().__init__(name="telegram", bus=bus, config=config)
        self._application = None
        self._thread: threading.Thread | None = None
        self._tg_loop: asyncio.AbstractEventLoop | None = None
        self._main_loop: asyncio.AbstractEventLoop | None = None
        self._allowed_users: set[int] = set()
        for uid in config.get("allowed_users", []):
            try:
                self._allowed_users.add(int(uid))
            except (ValueError, TypeError):
                pass
        self._last_bot_message: dict[str, int] = {}

    async def start(self) -> None:
        if self._running:
            return

        try:
            from telegram.ext import (
                ApplicationBuilder,
                CommandHandler,
                MessageHandler,
                filters,
            )
        except ImportError:
            logger.error(
                "python-telegram-bot is not installed. "
                "Install it with: uv add python-telegram-bot"
            )
            return

        bot_token = self.config.get("bot_token", "")
        if not bot_token:
            logger.error("Telegram channel requires bot_token")
            return

        self._main_loop = asyncio.get_event_loop()
        self._running = True
        self.bus.subscribe_outbound(self._on_outbound)

        app = ApplicationBuilder().token(bot_token).build()
        app.add_handler(CommandHandler("start", self._cmd_start))
        app.add_handler(CommandHandler("new", self._cmd_generic))
        app.add_handler(CommandHandler("status", self._cmd_generic))
        app.add_handler(CommandHandler("models", self._cmd_generic))
        app.add_handler(CommandHandler("memory", self._cmd_generic))
        app.add_handler(CommandHandler("help", self._cmd_generic))
        app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._on_text)
        )

        self._application = app
        self._thread = threading.Thread(target=self._run_polling, daemon=True)
        self._thread.start()
        logger.info("Telegram channel started")

    async def stop(self) -> None:
        self._running = False
        self.bus.unsubscribe_outbound(self._on_outbound)
        if self._tg_loop and self._tg_loop.is_running():
            self._tg_loop.call_soon_threadsafe(self._tg_loop.stop)
        if self._thread:
            self._thread.join(timeout=10)
            self._thread = None
        self._application = None
        logger.info("Telegram channel stopped")

    async def send(
        self, msg: OutboundMessage, *, _max_retries: int = 3
    ) -> None:
        if not self._application:
            return

        try:
            chat_id = int(msg.chat_id)
        except (ValueError, TypeError):
            logger.error("Invalid Telegram chat_id: %s", msg.chat_id)
            return

        # Convert Markdown to HTML for proper rendering in Telegram
        html_text = _markdown_to_html(msg.text)
        chunks = _split_html_message(html_text)

        bot = self._application.bot
        for chunk in chunks:
            kwargs: dict[str, Any] = {
                "chat_id": chat_id,
                "text": chunk,
                "parse_mode": "HTML",
            }

            last_exc: Exception | None = None
            for attempt in range(_max_retries):
                try:
                    sent = await bot.send_message(**kwargs)
                    self._last_bot_message[msg.chat_id] = sent.message_id
                    last_exc = None
                    break
                except Exception as exc:
                    last_exc = exc
                    err_lower = str(exc).lower()
                    if "can't parse" in err_lower or "bad request" in err_lower:
                        logger.warning(
                            "[Telegram] HTML parse failed, falling back "
                            "to plain text: %s",
                            exc,
                        )
                        fallback_kwargs: dict[str, Any] = {
                            "chat_id": chat_id,
                            "text": (
                                msg.text if len(chunks) == 1 else chunk
                            ),
                        }
                        try:
                            sent = await bot.send_message(**fallback_kwargs)
                            self._last_bot_message[msg.chat_id] = (
                                sent.message_id
                            )
                            last_exc = None
                            break
                        except Exception as fb_exc:
                            last_exc = fb_exc
                            break
                    if attempt < _max_retries - 1:
                        delay = 2 ** attempt
                        logger.warning(
                            "[Telegram] send failed (attempt %d/%d), "
                            "retrying in %ds: %s",
                            attempt + 1,
                            _max_retries,
                            delay,
                            exc,
                        )
                        await asyncio.sleep(delay)

            if last_exc:
                logger.error(
                    "[Telegram] send failed after %d attempts: %s",
                    _max_retries,
                    last_exc,
                )
                raise last_exc

    async def send_file(
        self, msg: OutboundMessage, attachment: ResolvedAttachment
    ) -> bool:
        if not self._application:
            return False

        try:
            chat_id = int(msg.chat_id)
        except (ValueError, TypeError):
            logger.error("[Telegram] Invalid chat_id: %s", msg.chat_id)
            return False

        if attachment.size > 50 * 1024 * 1024:
            logger.warning(
                "[Telegram] file too large (%d bytes), skipping: %s",
                attachment.size,
                attachment.filename,
            )
            return False

        bot = self._application.bot
        try:
            if attachment.is_image and attachment.size <= 10 * 1024 * 1024:
                with open(attachment.actual_path, "rb") as f:
                    kwargs: dict[str, Any] = {"chat_id": chat_id, "photo": f}
                    sent = await bot.send_photo(**kwargs)
            else:
                from telegram import InputFile

                with open(attachment.actual_path, "rb") as f:
                    input_file = InputFile(f, filename=attachment.filename)
                    kwargs = {"chat_id": chat_id, "document": input_file}
                    sent = await bot.send_document(**kwargs)

            self._last_bot_message[msg.chat_id] = sent.message_id
            logger.info(
                "[Telegram] file sent: %s to chat=%s",
                attachment.filename,
                msg.chat_id,
            )
            return True
        except Exception:
            logger.exception(
                "[Telegram] failed to send file: %s", attachment.filename
            )
            return False

    # -- helpers -----------------------------------------------------------

    async def _send_running_reply(
        self, chat_id: str, reply_to_message_id: int
    ) -> None:
        """Send a 'Working on it...' reply to the user's message."""
        if not self._application:
            return
        try:
            bot = self._application.bot
            await bot.send_message(
                chat_id=int(chat_id),
                text="Working on it...",
                reply_to_message_id=reply_to_message_id,
            )
            logger.info(
                "[Telegram] 'Working on it...' reply sent in chat=%s",
                chat_id,
            )
        except Exception:
            logger.exception(
                "[Telegram] failed to send running reply in chat=%s",
                chat_id,
            )

    # -- internal ----------------------------------------------------------

    def _run_polling(self) -> None:
        """Run telegram polling in a dedicated thread."""
        self._tg_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._tg_loop)
        try:
            self._tg_loop.run_until_complete(self._application.initialize())
            self._tg_loop.run_until_complete(self._application.start())
            self._tg_loop.run_until_complete(
                self._application.updater.start_polling()
            )
            self._tg_loop.run_forever()
        except Exception:
            if self._running:
                logger.exception("Telegram polling error")
        finally:
            try:
                if self._application.updater.running:
                    self._tg_loop.run_until_complete(
                        self._application.updater.stop()
                    )
                self._tg_loop.run_until_complete(self._application.stop())
                self._tg_loop.run_until_complete(
                    self._application.shutdown()
                )
            except Exception:
                logger.exception("Error during Telegram shutdown")

    def _check_user(self, user_id: int) -> bool:
        if not self._allowed_users:
            return True
        return user_id in self._allowed_users

    async def _cmd_start(self, update, context) -> None:
        """Handle /start command."""
        if not self._check_user(update.effective_user.id):
            return
        await update.message.reply_text(
            "Welcome to DeerFlow! Send me a message to start a "
            "conversation.\nType /help for available commands."
        )

    async def _cmd_generic(self, update, context) -> None:
        """Forward slash commands to the channel manager."""
        if not self._check_user(update.effective_user.id):
            return

        text = update.message.text
        chat_id = str(update.effective_chat.id)
        user_id = str(update.effective_user.id)
        msg_id = str(update.message.message_id)

        inbound = self._make_inbound(
            chat_id=chat_id,
            user_id=user_id,
            text=text,
            msg_type=InboundMessageType.COMMAND,
            thread_ts=msg_id,
        )

        if self._main_loop and self._main_loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.bus.publish_inbound(inbound), self._main_loop
            )

    async def _on_text(self, update, context) -> None:
        """Handle regular text messages."""
        if not self._check_user(update.effective_user.id):
            return

        text = update.message.text.strip()
        if not text:
            return

        chat_id = str(update.effective_chat.id)
        user_id = str(update.effective_user.id)
        msg_id = str(update.message.message_id)

        reply_to = update.message.reply_to_message
        if reply_to:
            topic_id = str(reply_to.message_id)
        else:
            topic_id = msg_id

        inbound = self._make_inbound(
            chat_id=chat_id,
            user_id=user_id,
            text=text,
            msg_type=InboundMessageType.CHAT,
            thread_ts=msg_id,
        )
        inbound.topic_id = topic_id

        if self._main_loop and self._main_loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.bus.publish_inbound(inbound), self._main_loop
            )