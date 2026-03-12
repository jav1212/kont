export abstract class Source<T> {
    protected _instance: T | null = null;

    /**
     * Getter robusto que asegura que la conexión exista
     * antes de realizar cualquier operación.
     */
    public get instance(): T {
        if (!this._instance) {
            throw new Error(`[${this.constructor.name}]: Source not initialized. Call connect() first.`);
        }
        return this._instance;
    }

    abstract connect(): T;
    abstract disconnect(): Promise<void>;
}