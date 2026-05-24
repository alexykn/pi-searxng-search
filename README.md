# pi-searxng-search

Local SearXNG-backed `web_search` tool for [pi](https://github.com/earendil-works/pi-coding-agent).

This package only searches. It returns compact Google-style results with titles, URLs, and snippets.

**Important:** this package does not fetch or extract page contents. For a useful search workflow, install a separate fetch plugin too. [`pi-smart-fetch`](https://www.npmjs.com/package/pi-smart-fetch) is recommended, but any plugin that provides `web_fetch` / `batch_web_fetch` can work.

## Why this exists

Most web search tools for coding agents rely on an API key, hosted account, or vendor-specific search backend such as Brave, Google, or Ollama's account-backed web search.

`pi-searxng-search` is built for a different workflow:

- local-first search through your own SearXNG instance
- no API key
- no account signup
- no hosted search dependency
- simple search-only behavior
- clean pairing with whichever `web_fetch` plugin you prefer

The intended agent workflow is:

1. `web_search` discovers relevant URLs.
2. `web_fetch` or `batch_web_fetch` reads selected pages as a separate step.

## Install

```sh
pi install npm:pi-searxng-search
```

Recommended companion fetch plugin:

```sh
pi install npm:pi-smart-fetch
```

Why fetch is separate: some users may already have another fetch plugin installed. Keeping fetch separate avoids duplicate `web_fetch` registrations and lets this package stay focused on local SearXNG search.

## Local development install

```sh
pi install ~/github/pi-searxng-search
```

Or try it for one run:

```sh
pi -e ~/github/pi-searxng-search
```

## Local SearXNG

A working local SearXNG compose setup is included in [`searxng/`](./searxng/).

```sh
cd searxng
podman compose up -d
curl 'http://127.0.0.1:8080/search?q=searxng&format=json'
```

Docker Compose works too:

```sh
cd searxng
docker compose up -d
```

Official SearXNG docs:

- [Container installation](https://docs.searxng.org/admin/installation-docker.html)
- [settings.yml](https://docs.searxng.org/admin/settings/settings.html)
- [Search API](https://docs.searxng.org/dev/search_api.html)

JSON output must be enabled in SearXNG. The included config does this with:

```yaml
search:
  formats:
    - html
    - json
```

## Configuration

By default, the tool queries:

```text
http://127.0.0.1:8080
```

If your SearXNG instance runs somewhere else, set `SEARXNG_URL` before starting pi:

```sh
export SEARXNG_URL='http://127.0.0.1:8888'
pi
```

Examples:

```sh
# Different local port
export SEARXNG_URL='http://127.0.0.1:8888'

# LAN or remote host
export SEARXNG_URL='http://192.168.1.50:8080'

# Reverse-proxied HTTPS instance
export SEARXNG_URL='https://search.example.com'
```

The tool also accepts a per-call `base_url` argument, but `SEARXNG_URL` is the recommended persistent configuration.

If you use the included compose setup and want to change its local port, copy `.env.example` to `.env` inside `searxng/` and edit `SEARXNG_PORT`:

```sh
cd searxng
cp .env.example .env
$EDITOR .env
podman compose up -d
```

Example `searxng/.env`:

```env
SEARXNG_PORT=8888
SEARXNG_BASE_URL=http://localhost:8888/
```

Then configure pi to match:

```sh
export SEARXNG_URL='http://127.0.0.1:8888'
```

## Tool

Registers:

- `web_search`

Parameters:

- `query` — search query
- `max_results` — maximum results to return, default `5`, clamped to `1..50`
- `categories` — optional comma-separated SearXNG categories
- `engines` — optional comma-separated SearXNG engines
- `language` — optional language code, for example `en` or `auto`
- `time_range` — optional `day`, `month`, or `year`
- `safesearch` — optional `0`, `1`, or `2`
- `page` — optional page number, default `1`
- `base_url` — optional SearXNG base URL
- `timeout_ms` — optional request timeout, default `15000`

Default SearXNG URL resolution:

1. `base_url` tool argument
2. `SEARXNG_URL` environment variable
3. `http://127.0.0.1:8080`

Example result format:

```text
Search results for: leptos server functions

1. Server Functions - book.leptos.dev
   URL: https://book.leptos.dev/server/25_server_functions.html
   Leptos is one of a number of modern frameworks that introduce...
   google · general
```

## Development

```sh
npm install
npm run typecheck
```

## License

MIT
