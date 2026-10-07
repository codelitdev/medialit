import { useCallback, useEffect, useRef, useState } from "react";
import {
    uploadFile,
    isUploadAbortedError,
    MediaLitUploadError,
    type UploadFileOptions,
    type UploadedMedia,
} from "@medialit/uploader";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UseMediaLitUploadOptions
    extends Omit<UploadFileOptions, "signal" | "onProgress" | "fileName"> {
    onUploadComplete?: (media: UploadedMedia) => void;
    onUploadError?: (error: MediaLitUploadError) => void;
}

export interface UploadState {
    status: UploadStatus;
    /** 0 to 100. */
    progress: number;
    file: File | null;
    media: UploadedMedia | null;
    error: MediaLitUploadError | null;
}

const idle: UploadState = {
    status: "idle",
    progress: 0,
    file: null,
    media: null,
    error: null,
};

export function useMediaLitUpload(options: UseMediaLitUploadOptions) {
    const [state, setState] = useState<UploadState>(idle);
    const optionsRef = useRef(options);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        optionsRef.current = options;
    });

    useEffect(() => () => controllerRef.current?.abort(), []);

    /**
     * Starts an upload and cancels any upload already running. Resolves the
     * media, or null when the upload fails or is cancelled. It never rejects;
     * read `error` or use `onUploadError`.
     */
    const upload = useCallback(
        async (
            file: File,
            overrides: Partial<UseMediaLitUploadOptions> = {},
        ): Promise<UploadedMedia | null> => {
            controllerRef.current?.abort();
            const controller = new AbortController();
            controllerRef.current = controller;
            const isCurrent = () => controllerRef.current === controller;

            const { onUploadComplete, onUploadError, ...uploadOptions } = {
                ...optionsRef.current,
                ...overrides,
            };
            setState({ ...idle, status: "uploading", file });

            try {
                const media = await uploadFile(file, {
                    ...uploadOptions,
                    signal: controller.signal,
                    onProgress: ({ percentage }) => {
                        if (isCurrent()) {
                            setState((s) => ({ ...s, progress: percentage }));
                        }
                    },
                });
                if (!isCurrent()) return null;
                controllerRef.current = null;
                setState({
                    ...idle,
                    status: "success",
                    progress: 100,
                    file,
                    media,
                });
                onUploadComplete?.(media);
                return media;
            } catch (err) {
                if (isUploadAbortedError(err) || !isCurrent()) return null;
                controllerRef.current = null;
                const error =
                    err instanceof MediaLitUploadError
                        ? err
                        : new MediaLitUploadError(
                              err instanceof Error
                                  ? err.message
                                  : "Upload failed",
                              { cause: err },
                          );
                setState((s) => ({ ...s, status: "error", error }));
                onUploadError?.(error);
                return null;
            }
        },
        [],
    );

    /** Stops the running upload and returns to idle. */
    const cancel = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setState(idle);
    }, []);

    return { ...state, upload, cancel, reset: cancel };
}
