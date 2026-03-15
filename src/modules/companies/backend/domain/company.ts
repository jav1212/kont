export interface Company {
    id: string;
    ownerId: string;
    name: string;
    rif?: string;
    createdAt?: Date;
    updatedAt?: Date;
}