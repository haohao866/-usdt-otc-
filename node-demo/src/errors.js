export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function invalid(message) {
  return new ApiError(422, 'VALIDATION_ERROR', message);
}
