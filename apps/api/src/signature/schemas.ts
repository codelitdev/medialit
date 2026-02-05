import Joi from "joi";

export const signatureResponseSchema = Joi.object({
    signature: Joi.string()
        .required()
        .description("HMAC signature for secure uploads"),
});
