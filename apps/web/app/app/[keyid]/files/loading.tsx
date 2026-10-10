import { Loader } from "@codelitdev/design-system";

export default function Loading() {
    return (
        <div className="loading-state">
            <Loader product="medialit" size={30} />
            <span>Loading files…</span>
        </div>
    );
}
