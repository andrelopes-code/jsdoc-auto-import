export interface ApiResponse<T = unknown> {
    success: boolean;
    data: T;
    error?: ApiError;
    meta?: PaginationMeta;
}

export interface Fooos {}

export interface ApiError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface PaginationMeta {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

export interface RequestConfig {
    baseUrl: string;
    timeout: number;
    headers: Record<string, string>;
    retries: number;
}
