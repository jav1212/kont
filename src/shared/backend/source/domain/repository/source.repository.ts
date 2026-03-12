export interface ISource<T> {
    connect(): T;
    disconnect(): Promise<void>;
    readonly instance: T;
}