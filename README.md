# Introduction

MediaLit is a Node.js based app to store, convert and optimise the media files on any AWS S3 compatible storage.

## Enable trust proxy

This app is based on express which cannot work reliably when it is behind a proxy. For example, it cannot detect if it behind a proxy.

Hence, we need to enable it on our own. To do that, set the following environment variable.

```
ENABLE_TRUST_PROXY=true
```

## Creating a local user

In order to interact with the API, you need to have an API key. To create one, execute the following command.

```sh
docker exec <container_id> dist/scripts/create-local-user.js
```

After running the above command, you will get an API key which you can use to interact with the app.

You can only run this script once.

> CAUTION: Keep the generated API key confidential as anyone could be able to store files on your instance.
