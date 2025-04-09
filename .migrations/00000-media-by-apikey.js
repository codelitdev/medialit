db.users.find().forEach(async (user) => {
    const firstApikey = await db.apikeys.findOne({ userId: user._id });
    if (firstApikey) {
        await db.media.updateMany(
            { userId: user._id },
            { $set: { apikey: firstApikey.key } },
        );
        console.log(`Updated ${user.email} media`);
    }
});
