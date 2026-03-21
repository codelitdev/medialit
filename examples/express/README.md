This is an Express example showing how to integrate the `medialit` SDK.

## Setup

1. Copy env file:

```bash
cp .env.example .env
```

2. Set your real API key in `.env`:

```bash
MEDIALIT_API_KEY=your_api_key_here
```

3. Install dependencies:

```bash
pnpm install
```

4. Run:

```bash
pnpm dev
```

## Routes

- `GET /health`
- `POST /api/medialit/upload`
- `GET /api/medialit`
- `GET /api/medialit/:id`
- `DELETE /api/medialit/:id`
- `GET /api/medialit/count`
- `POST /api/medialit/signature`

## Quick upload test

```bash
curl -X POST http://localhost:4000/api/medialit/upload \
  -F "file=@/absolute/path/to/image.jpg" \
  -F "access=public" \
  -F "caption=My first upload"
```
