import { AccessControl } from "@medialit/models";

export default interface GetPageProps {
    userId: string;
    apikey: string;
    access: AccessControl;
    page: number;
    recordsPerPage: number;
    group?: string;
}
