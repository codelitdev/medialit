---
title: "Upgrade from v0.5.x to v0.6.0"
description: "Move a self-hosted MediaLit installation to hashed, revocable API keys"
slug: upgrade-from-v0-5-x-to-v0-6-0
nav_order: 20
---

MediaLit v0.6.0 stores [API keys](/docs/api-keys) as hashes instead of plaintext, and lets an app have several keys that you can create and revoke separately. Upgrading needs a database migration. It keeps your files, apps and existing keys working, but it can't be undone.

<Callout type="warning" title="Back up the database first">
    The migration removes every plaintext key for good. The only way back to v0.5.x is to restore a backup.
</Callout>

## What changes

- **Existing keys keep working.** Each one becomes a "Default key" on its app, stored as a hash. The dashboard can no longer show the key, so make sure you have yours saved.
- **Keys go in the `x-medialit-apikey` header.** MediaLit no longer accepts a key in the request body. If your code sends it any other way, update it before you upgrade. The [Node.js SDK](/docs/node-sdk) already uses the header.
- **An app can have up to 10 keys.** Create them under **Settings** > **API keys** in the dashboard. See [rotating a key](/docs/api-keys#rotate-a-key).
- **Deactivated accounts get `403 account_inactive`** instead of a generic error.
- **Other services in your Compose file can get a key at startup.** See [create a key at startup](/docs/self-hosting#create-a-key-at-startup).

## 1. Back up the database

With the bundled PostgreSQL service:

```sh
docker compose exec -T postgres pg_dump -U medialit medialit > medialit-before-0.6.0.sql
```

If you manage PostgreSQL yourself, take a backup the way you normally do. Your files in S3 aren't touched by this upgrade.

## 2. Look for media that belongs to no app

The migration moves each file and setting from its plaintext key to the app that owns the key. If a row's key matches no app, the migration stops and changes nothing, because a person should decide what happens to that media. Old installations often have a few, for example from apps deleted before MediaLit linked them.

Find them on the v0.5.x database:

```sql
SELECT left(m.apikey, 6) AS key_start, count(*) AS files
FROM media m
WHERE NOT EXISTS (SELECT 1 FROM api_keys a WHERE a.key = m.apikey)
GROUP BY m.apikey
ORDER BY files DESC;

SELECT left(s.apikey, 6) AS key_start
FROM media_settings s
WHERE NOT EXISTS (SELECT 1 FROM api_keys a WHERE a.key = s.apikey);
```

Run them with:

```sh
docker compose exec postgres psql -U medialit medialit
```

If both return nothing, go to step 3. Otherwise, decide for each key whether the media matters. If it does, find the app it belongs to and fix the key in the `media` table. If it doesn't, delete the rows:

```sql
DELETE FROM media m
WHERE NOT EXISTS (SELECT 1 FROM api_keys a WHERE a.key = m.apikey);

DELETE FROM media_settings s
WHERE NOT EXISTS (SELECT 1 FROM api_keys a WHERE a.key = s.apikey);
```

<Callout type="info">
    Deleting rows doesn't delete the files in your bucket. Remove them there too if you want the space back.
</Callout>

Upload signatures and resumable-upload records with an unknown key are deleted by the migration itself. They expire within days anyway.

## 3. Upgrade

```sh
docker compose pull
docker compose up -d
```

The `init` service runs the migration before the API starts. If it stops on orphaned media, `docker compose logs init` shows how many rows and which table. Fix them as in step 2 and run `docker compose up -d` again. The migration runs in one transaction, so a failed attempt leaves the database as it was.

If you run the image without Docker Compose, run `bun apps/api/src/db/migrate.ts` with the new image before starting the API.

## 4. Check it worked

1. Call the API with one of your existing keys, for example `curl -X POST https://medialit.example.com/media/get/count -H "x-medialit-apikey: $MEDIALIT_API_KEY"`. It should return a count.
2. Sign in to the dashboard, open an app and check **Settings** > **API keys**. You should see a **Default key** showing only its first four characters.
3. Create a new key and use it in place of the old one when convenient. New keys are longer, and secret scanners recognize their `ml_live_` prefix.
