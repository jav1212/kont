// result.ts — railway-oriented error handling primitive.
// Role: core domain — wraps every use-case output in a typed success/failure envelope.
// Invariant: Result instances are frozen value objects; never mutate after construction.
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

    Object.freeze(this); // Enforce immutability — Result instances are value objects.
  }

  public getValue(): T {
    if (!this.isSuccess) {
      throw new Error("Cannot get value from a failed result.");
    }
    return this._value as T;
  }

  public getError(): string {
    if (this.isSuccess) {
      throw new Error("Cannot get error from a successful result.");
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