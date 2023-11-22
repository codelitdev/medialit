import { apikeyRestriction } from "./constants";

const apikeyRes = [...apikeyRestriction] as const;
export type APIKEY_RESTRICTION = (typeof apikeyRes)[number];
