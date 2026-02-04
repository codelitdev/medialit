import mongoose, { FilterQuery } from "mongoose";
import { numberOfRecordsPerPage } from "../config/constants";
import GetPageProps from "./GetPageProps";
import MediaModel from "./model";
import { Constants, type MediaWithUserId } from "@medialit/models";

export async function getMedia({
    userId,
    apikey,
    mediaId,
}: {
    userId: string;
    apikey: string;
    mediaId: string;
}): Promise<MediaWithUserId | null> {
    return (await MediaModel.findOne({
        mediaId,
        apikey,
        userId,
        // temp: { $ne: true },
    }).lean()) as MediaWithUserId | null;
}

export async function getMediaCount({
    userId,
    apikey,
}: {
    userId: string;
    apikey: string;
}): Promise<number> {
    return await MediaModel.countDocuments({
        apikey,
        userId,
        temp: { $ne: true },
    }).lean();
}

export async function getTotalSpace({
    userId,
    apikey,
}: {
    userId: mongoose.Types.ObjectId;
    apikey?: string;
}): Promise<number> {
    const query = apikey
        ? { userId, apikey, temp: { $ne: true } }
        : { userId, temp: { $ne: true } };
    const result = await MediaModel.aggregate([
        {
            $match: query,
        },
        {
            $group: {
                _id: null,
                totalSize: { $sum: "$size" },
            },
        },
        {
            $project: {
                _id: 0,
                totalSize: 1,
            },
        },
    ]);

    if (result.length === 0) {
        return 0;
    }

    return result[0].totalSize;
}

export async function getPaginatedMedia({
    userId,
    apikey,
    access,
    page,
    group,
    recordsPerPage,
}: GetPageProps): Promise<MediaWithUserId[]> {
    const query: FilterQuery<MediaWithUserId> = {
        userId,
        apikey,
        temp: { $ne: true },
    };
    if (access) {
        query.accessControl =
            access === Constants.AccessControl.PRIVATE
                ? Constants.AccessControl.PRIVATE
                : Constants.AccessControl.PUBLIC;
    }
    if (group) {
        query.group = group;
    }
    const limitWithFallback = recordsPerPage || numberOfRecordsPerPage;

    return await MediaModel.find(query, {
        userId: 1,
        mediaId: 1,
        originalFileName: 1,
        mimeType: 1,
        size: 1,
        accessControl: 1,
        thumbnailGenerated: 1,
        caption: 1,
        group: 1,
    })
        .sort({ _id: -1 })
        .skip(page ? (page - 1) * limitWithFallback : 0)
        .limit(limitWithFallback);
}

export async function deleteMediaQuery(
    userId: string,
    mediaId: string,
): Promise<any> {
    return await MediaModel.deleteOne({ userId, mediaId });
}

export async function createMedia(
    mediaData: MediaWithUserId,
): Promise<MediaWithUserId> {
    const media: MediaWithUserId = await MediaModel.create(mediaData);
    return media;
}

export default {
    getMedia,
    getMediaCount,
    getTotalSpace,
    getPaginatedMedia,
    deleteMediaQuery,
    createMedia,
};
