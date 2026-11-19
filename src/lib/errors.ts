/** A failure with an HTTP status and a message safe to show the user. */
export class DcaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
