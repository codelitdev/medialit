import { defineBillingConfig } from "@codelitdev/billing/config";

// Paid plans only. Basic is the unpaid cloud plan and OSS is a deployment
// mode; neither belongs in planIds.
export default defineBillingConfig({
    dialect: "postgresql",
    adapter: "drizzle",
    output: "./src/db/schema/billing.generated.ts",
    billableEntity: {
        modelName: "user",
        tableImport: "./auth.generated",
        tableExport: "user",
        idColumn: "id",
        idType: "text",
        onDelete: "restrict",
    },
    payer: {
        modelName: "user",
        tableImport: "./billing-payer",
        tableExport: "payerUser",
        idColumn: "id",
        idType: "text",
        onDelete: "restrict",
    },
    planIds: ["pro"],
    requiredOfferKeys: ["pro_month", "pro_year"],
});
