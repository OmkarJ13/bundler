import './side-effect.js';

export const foo = 'foo in foo.js';

export function hello() {
  let foo = 'foo';
  foo = 'reassigning foo';
  console.log('hello', foo);
}
