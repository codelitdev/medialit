/** An upload carried an asset ID the app already has. */
export class AssetExistsError extends Error {
    constructor(
        readonly mediaId: string | undefined,
        readonly sealed: boolean | undefined,
    ) {
        super("An upload with this asset ID already exists");
        this.name = "AssetExistsError";
    }

    /** The body a client reads to resume: seal it if it is not sealed yet. */
    toBody() {
        return {
            error: "asset_exists",
            mediaId: this.mediaId,
            sealed: this.sealed,
        };
    }
}
