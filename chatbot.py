from __future__ import annotations

import argparse
import json
import time
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from openai import APIConnectionError, APIError, OpenAI, RateLimitError
from os import getenv


DEFAULT_MODEL = "gpt-4.1-mini"
DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant."
DEFAULT_HISTORY_LIMIT = 40


def maybe_creator_reply(msg: str) -> str | None:
    """
    Deterministic reply for "who is the author/creator" questions.
    Keep it simple and avoid LLM variance: always return the author's name.
    """
    m = (msg or "").strip()
    if not m:
        return None
    ml = m.lower()

    q_words = {
        "who",
        "whom",
        "ov",
        "um",
        "harc",
        "кто",
        "кем",
        "kto",
        "kem",
        "հարց",
        "ով",
        "ում",
    }
    creator_words = {
        "author",
        "creator",
        "created",
        "create",
        "made",
        "build",
        "built",
        "develop",
        "developed",
        # Armenian
        "ստեղծ",
        "սարք",
        "հեղինակ",
        # Armenian (latin translit)
        "stex",
        "stexc",
        "sarq",
        "heghinak",
        "hexinak",
        "hexinaki",
        # Russian
        "создал",
        "создатель",
        "сделал",
        "разработал",
        "разработчик",
        # Persian
        "سازنده",
        "ساخت",
        "ساخته",
    }

    looks_like_question = ("?" in m) or any(w and w in ml for w in q_words)
    talks_about_creation = any(w and w in ml for w in creator_words)
    very_short = len(re.findall(r"\\w+", ml)) <= 4

    if talks_about_creation and (looks_like_question or very_short):
        return "Erik Petrosyan"
    return None


@dataclass
class ChatConfig:
    model: str = DEFAULT_MODEL
    system_prompt: str = DEFAULT_SYSTEM_PROMPT
    temperature: float = 0.7
    max_output_tokens: int | None = None
    history_limit: int = DEFAULT_HISTORY_LIMIT
    retry_attempts: int = 3
    retry_base_delay_sec: float = 1.0


@dataclass
class ChatSession:
    config: ChatConfig
    messages: list[dict[str, str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.messages = [{"role": "system", "content": self.config.system_prompt}]

    def append_user(self, text: str) -> None:
        self.messages.append({"role": "user", "content": text})
        self._trim_history()

    def append_assistant(self, text: str) -> None:
        self.messages.append({"role": "assistant", "content": text})
        self._trim_history()

    def _trim_history(self) -> None:
        if self.config.history_limit <= 0:
            return
        system_msg = self.messages[0]
        convo = self.messages[1:]
        max_items = self.config.history_limit * 2
        if len(convo) > max_items:
            convo = convo[-max_items:]
            self.messages = [system_msg] + convo

    def save_json(self, path: Path) -> None:
        payload = {
            "model": self.config.model,
            "system_prompt": self.config.system_prompt,
            "messages": self.messages,
        }
        path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")

    def load_json(self, path: Path) -> None:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Invalid file format: expected object")
        messages = payload.get("messages")
        if not isinstance(messages, list):
            raise ValueError("Invalid file format: 'messages' must be a list")
        cleaned: list[dict[str, str]] = []
        for item in messages:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role", "")).strip()
            content = str(item.get("content", "")).strip()
            if role in {"system", "user", "assistant"} and content:
                cleaned.append({"role": role, "content": content})
        if not cleaned:
            raise ValueError("No valid messages found")
        if cleaned[0]["role"] != "system":
            cleaned.insert(0, {"role": "system", "content": self.config.system_prompt})
        self.messages = cleaned
        model = payload.get("model")
        if isinstance(model, str) and model.strip():
            self.config.model = model.strip()
        system_prompt = payload.get("system_prompt")
        if isinstance(system_prompt, str) and system_prompt.strip():
            self.config.system_prompt = system_prompt.strip()
            self.messages[0]["content"] = self.config.system_prompt


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Advanced terminal chatbot")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="OpenAI model name")
    parser.add_argument("--system", default=DEFAULT_SYSTEM_PROMPT, help="System prompt")
    parser.add_argument("--temperature", type=float, default=0.7, help="Sampling temperature")
    parser.add_argument("--max-output-tokens", type=int, default=None, help="Max generated tokens")
    parser.add_argument("--history-limit", type=int, default=DEFAULT_HISTORY_LIMIT, help="Max turns to keep")
    parser.add_argument("--retry-attempts", type=int, default=3, help="Retry attempts for transient errors")
    parser.add_argument("--retry-base-delay-sec", type=float, default=1.0, help="Base retry delay seconds")
    return parser.parse_args()


def get_api_key() -> str:
    api_key = (getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    return api_key


def build_client() -> OpenAI:
    return OpenAI(api_key=get_api_key())


def print_help() -> None:
    print(
        "\nCommands:\n"
        "  /help                      Show this help\n"
        "  /exit                      Exit chatbot\n"
        "  /clear                     Clear conversation\n"
        "  /model <name>              Change model\n"
        "  /system <prompt>           Change system prompt\n"
        "  /save <file.json>          Save session to JSON\n"
        "  /load <file.json>          Load session from JSON\n"
    )


def parse_command(raw: str) -> tuple[str, str]:
    text = raw.strip()
    if not text.startswith("/"):
        return "", ""
    parts = text.split(maxsplit=1)
    command = parts[0].lower()
    arg = parts[1].strip() if len(parts) == 2 else ""
    return command, arg


def request_completion(client: OpenAI, session: ChatSession) -> str:
    last_exc: Exception | None = None

    for attempt in range(1, session.config.retry_attempts + 1):
        try:
            kwargs: dict[str, Any] = {
                "model": session.config.model,
                "messages": session.messages,
                "temperature": session.config.temperature,
            }
            if session.config.max_output_tokens is not None:
                kwargs["max_tokens"] = session.config.max_output_tokens

            response = client.chat.completions.create(**kwargs)
            return (response.choices[0].message.content or "").strip()
        except (APIConnectionError, RateLimitError, APIError) as exc:
            last_exc = exc
            if attempt >= session.config.retry_attempts:
                break
            delay = session.config.retry_base_delay_sec * (2 ** (attempt - 1))
            print(f"[warn] transient error ({exc}); retrying in {delay:.1f}s")
            time.sleep(delay)
        except Exception as exc:
            raise RuntimeError(f"Unexpected request error: {exc}") from exc

    raise RuntimeError(f"OpenAI request failed after retries: {last_exc}")


def handle_command(command: str, arg: str, session: ChatSession) -> bool:
    if command in {"/exit", "/quit"}:
        print("Chatbot stopped.")
        return False
    if command == "/help":
        print_help()
        return True
    if command == "/clear":
        session.reset()
        print("Conversation cleared.")
        return True
    if command == "/model":
        if not arg:
            print(f"Current model: {session.config.model}")
            return True
        session.config.model = arg
        print(f"Model changed to: {session.config.model}")
        return True
    if command == "/system":
        if not arg:
            print("Usage: /system <prompt>")
            return True
        session.config.system_prompt = arg
        session.messages[0] = {"role": "system", "content": arg}
        print("System prompt updated.")
        return True
    if command == "/save":
        if not arg:
            print("Usage: /save <file.json>")
            return True
        path = Path(arg).expanduser()
        session.save_json(path)
        print(f"Saved: {path}")
        return True
    if command == "/load":
        if not arg:
            print("Usage: /load <file.json>")
            return True
        path = Path(arg).expanduser()
        session.load_json(path)
        print(f"Loaded: {path}")
        return True

    print("Unknown command. Type /help")
    return True


def run_chat(client: OpenAI, session: ChatSession) -> None:
    print("yan started. Type /help for commands.")
    while True:
        try:
            raw = input("You: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nChatbot stopped.")
            return

        if not raw:
            continue

        command, arg = parse_command(raw)
        if command:
            if not handle_command(command, arg, session):
                return
            continue

        special = maybe_creator_reply(raw)
        if special:
            session.append_user(raw)
            session.append_assistant(special)
            print(f"AI: {special}\n")
            continue

        session.append_user(raw)
        try:
            reply = request_completion(client, session)
        except Exception as exc:
            session.messages.pop()  # rollback user message on failure
            print(f"OpenAI request failed: {exc}")
            continue

        if not reply:
            reply = "(empty response)"
        session.append_assistant(reply)
        print(f"AI: {reply}\n")


def main() -> None:
    args = parse_args()
    config = ChatConfig(
        model=args.model,
        system_prompt=args.system,
        temperature=args.temperature,
        max_output_tokens=args.max_output_tokens,
        history_limit=args.history_limit,
        retry_attempts=max(1, args.retry_attempts),
        retry_base_delay_sec=max(0.1, args.retry_base_delay_sec),
    )
    client = build_client()
    session = ChatSession(config=config)
    run_chat(client, session)


if __name__ == "__main__":
    main()


