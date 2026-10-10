import { ArrowUpRight, BookOpenText } from "lucide-react";

export default function Docs() {
    return (
        <section className="docs-landing-card">
            <span className="settings-card-icon">
                <BookOpenText aria-hidden="true" />
            </span>
            <p className="docs-eyebrow">MediaLit documentation</p>
            <h1>Build with your media library</h1>
            <p className="docs-description">
                Learn how to upload files, serve media, and connect MediaLit to
                your product.
            </p>
            <a
                className="workspace-button"
                href="https://docs.medialit.cloud/quick-start"
                target="_blank"
                rel="noreferrer"
            >
                Browse the docs <ArrowUpRight aria-hidden="true" />
            </a>
        </section>
    );
}
