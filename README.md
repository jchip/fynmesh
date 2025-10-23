# FynMesh - GitHub Pages Deployment

This branch contains the built demo site for FynMesh, automatically deployed to GitHub Pages.

**Live Demo:** [www.fynetiq.com](https://www.fynetiq.com)

## About

This is an automated deployment branch. The site is built from the `main` branch using:

```bash
cd demo/demo-server
NODE_ENV=production xrun gh-publish
```

## Contents

- `/docs/` - Built demo site with all FynApps and dependencies
- Production-optimized builds (no source maps, no TypeScript definitions)

## Development

For development and source code, see the `main` branch.

---

*This branch is auto-generated. Do not manually edit files here.*

