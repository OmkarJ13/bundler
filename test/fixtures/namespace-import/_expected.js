const foo = 'foo';
const namespacedFoo = Object.freeze({
  "foo": foo
});
console.log(namespacedFoo.foo);
