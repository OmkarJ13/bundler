const foo = 'foo in side-effect.js';
console.log('hey look this is a side effect', foo);
const foo$1 = 'foo in foo.js';
const foo$2 = 'foo in index.js';
console.log(foo$2, foo$1);
