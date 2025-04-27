import { Kernel } from '../src';

// Create a new kernel instance
const kernel = new Kernel({
  baseUrl: 'https://example.com/fynapps/',
  debug: true
});

// Load a fynapp
async function loadFynapp() {
  try {
    await kernel.loadFynapp('example-fynapp');
    console.log('Fynapp loaded successfully');
    
    // Get a module from the fynapp
    const module = await kernel.getModule('example-fynapp', './App');
    console.log('Module loaded:', module);
  } catch (error) {
    console.error('Error loading fynapp:', error);
  }
}

// Execute the example
loadFynapp().catch(console.error);
