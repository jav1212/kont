export interface User {
    id: string;
    email: string;
    name?: string;
    phone?: string;
    avatarUrl?: string;
    createdAt?: Date;
    updatedAt?: Date;
}