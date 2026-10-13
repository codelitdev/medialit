import { Loader } from "@codelitdev/design-system";

export default function Loading() {
    return (
        <div className="loading-state" role="status">
            <Loader product="medialit" size={64} />
            <span className="visually-hidden">Loading</span>
        </div>
    );
}
