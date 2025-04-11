let ID = 0;

export function getId() {
  return ID++;
}

export function getObjectAsString(obj: object): string {
  return `{${Object.entries(obj)
    .map(([key, value]) => {
      if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value !== null
      ) {
        return `"${key}":${getObjectAsString(value)}`;
      } else if (typeof value === 'string') {
        return `"${key}":"${value}"`;
      }

      return `"${key}":${value}`;
    })
    .join(',')}}`;
}
