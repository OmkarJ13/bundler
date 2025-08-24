export function defineTest(
  name: string,
  {
    only,
    skip,
    throwsError,
  }: { only?: boolean; skip?: boolean; throwsError?: string } = {}
) {
  return {
    name,
    only,
    skip,
    throwsError,
  };
}
