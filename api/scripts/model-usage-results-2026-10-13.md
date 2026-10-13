# Chat model usage probe — 2026-10-13

Each configured chat model received one minimal request through the configured proxy. The table shows HTTP status and the usage returned by that request: input / output / cache read tokens. A dash means the response contained no such field; errors contained no usage. GPT and DeepSeek used Chat Completions, Claude used Messages, and Gemini used Generate Content. The probe did not inspect image generation models.

| Provider | Model | HTTP | Input | Output | Cache read |
| --- | --- | ---: | ---: | ---: | ---: |
| OpenAI | gpt-5.5 | 200 | 9 | 15 | 0 |
| OpenAI | gpt-5.4 | 200 | 9 | 4 | 0 |
| OpenAI | gpt-5.4-nano | 200 | 9 | 5 | 0 |
| OpenAI | gpt-5.4-mini | 200 | 9 | 4 | 0 |
| OpenAI | gpt-5.3-codex | 200 | 9 | 6 | 0 |
| OpenAI | gpt-5.2-codex | 400 | — | — | — |
| OpenAI | gpt-5.2 | 200 | 9 | 4 | 0 |
| OpenAI | gpt-5.1 | 200 | 9 | 10 | 0 |
| OpenAI | gpt-5.1-codex | 400 | — | — | — |
| OpenAI | gpt-5-codex | 400 | — | — | — |
| OpenAI | gpt-5-mini | 200 | 9 | 32 | 0 |
| OpenAI | gpt-5-nano | 200 | 9 | 32 | 0 |
| OpenAI | o3 | 200 | 9 | 32 | 0 |
| OpenAI | o4-mini | 200 | 9 | 32 | 0 |
| OpenAI | gpt-4.1 | 200 | 10 | 2 | 0 |
| OpenAI | gpt-4.1-mini | 200 | 10 | 2 | 0 |
| OpenAI | gpt-4.1-nano | 200 | 10 | 1 | 0 |
| OpenAI | o3-mini | 200 | 9 | 32 | 0 |
| OpenAI | gpt-4o | 200 | 10 | 2 | 0 |
| OpenAI | gpt-4o-mini | 200 | 10 | 2 | 0 |
| Anthropic | claude-sonnet-4-6 | 200 | 10 | 5 | 0 |
| Anthropic | claude-opus-4-6 | 200 | 10 | 5 | 0 |
| Anthropic | claude-opus-4-5 | 200 | 10 | 5 | 0 |
| Anthropic | claude-haiku-4-5 | 200 | 10 | 5 | 0 |
| Anthropic | claude-sonnet-4-5 | 400 | — | — | — |
| Anthropic | claude-opus-4-0 | 400 | — | — | — |
| Anthropic | claude-sonnet-4-0 | 400 | — | — | — |
| Google | gemini-3.1-pro-preview | 200 | 3 | 28 | — |
| Google | gemini-3.1-pro-preview-customtools | 200 | 3 | 28 | — |
| Google | gemini-3-flash-preview | 200 | 3 | 21 | — |
| Google | gemini-2.5-flash | 200 | 3 | 18 | — |
| Google | gemini-2.5-flash-lite | 200 | 3 | 2 | — |
| Google | gemini-2.5-pro | 200 | 3 | 27 | — |
| DeepSeek | deepseek-v3.2 | 404 | — | — | — |
| DeepSeek | deepseek-v4-pro | 200 | 86 | 19 | 0 |

Google output includes `thoughtsTokenCount` when present. These small requests did not create a reusable cache. Some reasoning models used the full 32-token output cap, so a text answer was not required to verify their usage response. Three rejected Codex models also returned 400 through `/responses`.

Repeated long-prefix probes confirmed nonzero usage:

| Model | First request | Second identical request |
| --- | --- | --- |
| gpt-5.4 | input 1,761; output 4; cache read 0 | input 1,761; output 4; cache read 1,664 |
| claude-sonnet-4-6 | ordinary input 3; output 4; cache write 2,508; cache read 0 | ordinary input 3; output 4; cache write 0; cache read 2,508 |
| gemini-2.5-flash | input 3,504; output 20; cache field absent | input 3,504; output 20; cache read 2,034 |

The Claude probe placed an explicit cache breakpoint on the repeated prompt. The application's Anthropic configuration has prompt caching enabled by default, but the exact breakpoint and reuse depend on the chat request.

The requests used synthetic prompts. They did not inspect or alter user conversations, quota records, or the online deployment. Run `node api/scripts/inspect-model-usage.js` to repeat the small probe; it sends billable requests to every configured chat model.
