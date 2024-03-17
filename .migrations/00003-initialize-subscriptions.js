db.subscribers.updateMany(
    {},
    { $set: { subscriptionStatus: "not-subscribed" } }
);
