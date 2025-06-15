const obj = { a: 'value-a', b: 'value-b', c: 'value-c' };
export const { a, b: foo, ...rest } = obj;
