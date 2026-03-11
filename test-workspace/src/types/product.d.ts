export interface Product {
    id: string;
    name: string;
    price: number;
    category: ProductCategory;
    inStock: boolean;
}

export type ProductCategory = 'electronics' | 'clothing' | 'food' | 'books';

export interface CartItem {
    product: Product;
    quantity: number;
}

export interface Cart {
    items: CartItem[];
    total: number;
    discount?: number;
}
