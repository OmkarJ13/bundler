const obj = {
  a: 'value-a',
  b: 'value-b',
  c: 'value-c'
};
const {
  a,
  b: foo,
  ...rest
} = obj;
console.log(a, foo, rest.c);
