This is a [Next.js](https://nextjs.org) project which demonstrates the usage of `medialit` package.

## Features

This example app demonstrates two upload methods:

1. **Standard Upload** - Traditional single-request upload, best for smaller files
2. **TUS Resumable Upload** - Multipart resumable uploads using the TUS protocol with:
    - Real-time upload progress tracking
    - Automatic retry on failure
    - Cancel upload capability
    - Ideal for larger files and unreliable connections

Additional features:

- Automatic thumbnail generation
- Media information retrieval
- File deletion
- Media listing with pagination

## Getting Started

First, add the MediaLit API key to `.env` file in the root directory:

```env
MEDIALIT_API_KEY=your_api_key_here
```

Optionally, if you're running a self-hosted instance, set the endpoint:

```env
MEDIALIT_ENDPOINT=http://localhost:3001
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
