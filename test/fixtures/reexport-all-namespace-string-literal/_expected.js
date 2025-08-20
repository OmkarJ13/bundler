const bar = 'bar';
const baz = 'baz';
const index = Object.freeze({
  "bar": bar,
  "baz": baz
});
console.log(index.bar);
console.log(index.baz);