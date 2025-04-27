# esm-pkg

A simple ESM-only package.

## Usage

```js
// Import specific functions
import { capitalizeText, addNumbers } from 'esm-pkg';

// Or import everything
import * as esmPkg from 'esm-pkg';

// Use the functions
console.log(capitalizeText('hello')); // Hello
console.log(addNumbers(2, 3)); // 5
```

This package is pure ESM - it uses ES modules exclusively.