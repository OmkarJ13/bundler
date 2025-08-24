export function defineTest(
  name: string,
  {
    only,
    skip,
    throwsError,
  }: { only?: boolean; skip?: boolean; throwsError?: string | RegExp } = {}
) {
  return {
    name,
    only,
    skip,
    throwsError,
  };
}
