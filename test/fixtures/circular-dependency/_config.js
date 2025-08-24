import { defineTest } from '../../utils/test';

export default defineTest(
  'should throw an error when circular dependencies are present',
  {
    throwsError:
      'Circular dependency detected: /Users/omkarjoshi/dev/Redemption/test/fixtures/circular-dependency/index.js -> /Users/omkarjoshi/dev/Redemption/test/fixtures/circular-dependency/foo.js -> /Users/omkarjoshi/dev/Redemption/test/fixtures/circular-dependency/bar.js -> /Users/omkarjoshi/dev/Redemption/test/fixtures/circular-dependency/index.js',
  }
);
