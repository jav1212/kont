export class Result<T> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  private readonly _value?: T;
  private readonly _error?: string;

  private constructor(isSuccess: boolean, error?: string, value?: T) {
    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._error = error;
    this._value = value;

    Object.freeze(this); // Inmutabilidad para DDD
  }

  public getValue(): T {
    if (!this.isSuccess) {
      throw new Error("No se puede obtener el valor de un resultado fallido.");
    }
    return this._value as T;
  }

  public getError(): string {
    if (this.isSuccess) {
      throw new Error("No se puede obtener el error de un resultado exitoso.");
    }
    return this._error as string;
  }

  public static success<U>(value?: U): Result<U> {
    return new Result<U>(true, undefined, value);
  }

  public static fail<U>(error: string): Result<U> {
    return new Result<U>(false, error);
  }
}