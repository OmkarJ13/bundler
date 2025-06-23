export function defineTest(
  name: string,
  { only, skip }: { only?: boolean; skip?: boolean } = {}
) {
  return {
    name,
    only,
    skip,
  };
}
