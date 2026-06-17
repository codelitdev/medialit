// Find all unique userIds that have non-deleted API keys
const userIds = db.apikeys.distinct("userId", { deleted: { $ne: true } });

userIds.forEach((userId) => {
    // Check if the user already has a default API key
    const hasDefault = db.apikeys.findOne({
        userId: userId,
        default: true,
        deleted: { $ne: true },
    });
    if (hasDefault) {
        return; // Already has a default key, skip
    }

    // Find the oldest active API key for this user
    const oldestKey = db.apikeys
        .find({ userId: userId, deleted: { $ne: true } })
        .sort({ createdAt: 1 })
        .limit(1)
        .toArray()[0];

    if (oldestKey) {
        db.apikeys.updateOne(
            { _id: oldestKey._id },
            { $set: { default: true } },
        );
    }
});
