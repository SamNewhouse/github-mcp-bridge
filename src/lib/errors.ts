export class AppError extends Error {
  public readonly status: number;

  constructor(message: string, status = 500, options?: ErrorOptions) {
    super(message, options);
    this.name = "AppError";
    this.status = Number.isInteger(status) && status >= 100 ? status : 500;
  }
}

function hasStatus(error: unknown): error is { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as Record<string, unknown>).status === "number"
  );
}

export function getErrorStatus(error: unknown): number {
  return hasStatus(error) ? error.status : 500;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Internal server error";
}
