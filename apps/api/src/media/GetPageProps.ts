import { AccessControl } from "@medialit/models";

export default interface GetPageProps {
    userId: string;
    apikey: string;
    page?: number;
    access?: AccessControl;
    group?: string;
    recordsPerPage?: number;
}
