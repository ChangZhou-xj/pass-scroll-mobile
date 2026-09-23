export class BusinessException extends Error {
  constructor(
    public readonly businessCode: number,
    message: string,
  ) {
    super(message);
    this.name = "BusinessException";
  }
}
