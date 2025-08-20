const foo = 'foo in side-effect.js';
console.log('hey look this is a side effect', foo);
const foo$1 = 'foo in foo.js';
function hello() {
  let foo$2 = 'foo';
  foo$2 = 'reassigning foo';
  console.log('hello', foo$2);
}
const foo$3 = Object.freeze({
  "foo": foo$1,
  "hello": hello
});
foo$3.hello();
console.log(foo$3.foo);