# Local SearXNG for pi-searxng-search

This compose setup runs a local-only SearXNG instance for the pi search plugin.

## Start

With Podman Compose:

```sh
cd ~/github/pi-searxng-search/searxng
podman compose up -d
```

With Docker Compose:

```sh
cd ~/github/pi-searxng-search/searxng
docker compose up -d
```

The instance listens on `127.0.0.1:8080` by default.

## Test JSON search

```sh
curl 'http://127.0.0.1:8080/search?q=searxng&format=json'
```

If JSON is not enabled, SearXNG returns `403 Forbidden`; this setup enables `search.formats: [html, json]` in `core-config/settings.yml`.

## Change port

```sh
cp .env.example .env
$EDITOR .env
podman compose up -d
```

## Stop

```sh
podman compose down
# or: docker compose down
```

## Update image

```sh
podman compose pull
podman compose up -d
```
