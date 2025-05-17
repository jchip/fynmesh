#!/bin/bash

# Build the package
npm run build

# Install globally
npm install -g .

echo "CFA (Create-FynApp) command installed globally. You can now use 'cfa' in your terminal."