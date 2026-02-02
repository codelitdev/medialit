db.media.updateMany(
    { accessControl: "public-read" },
    { $set: { accessControl: "public" } },
);
