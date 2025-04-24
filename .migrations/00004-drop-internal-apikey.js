db.apikeys.deleteMany({ name: "internal-apikey", internal: true });
db.apikeys.updateMany({}, { $unset: { internal: "" } });
