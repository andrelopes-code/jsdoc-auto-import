export interface User {
    id: number;
    name: string;
    email: string;
    role: UserRole;
    createdAt: Date;
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface UserPreferences {
    theme: 'light' | 'dark';
    language: string;
    notifications: boolean;
}
