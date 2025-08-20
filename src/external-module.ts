export class ExternalModule {
  path: string;

  exports: Record<
    string,
    {
      identifierName: string;
    }
  > = {};

  constructor(path: string) {
    this.path = path;
  }
}
