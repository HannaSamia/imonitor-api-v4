export class ApiResponse<T> {
  success: boolean;
  status: number;
  message: string;
  result?: T;

  constructor(status: number, message: string, result?: T) {
    this.success = true;
    this.status = status;
    this.message = message;
    if (result !== undefined) {
      this.result = result;
    }
  }
}
