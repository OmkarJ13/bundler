const bar = 'bar';
const baz = 'baz';
const foo = Object.freeze({
  "bar": bar,
  "baz": baz
});
console.log(foo.bar);
console.log(foo.baz);