# Migration Guide: src → src_new

This guide explains how to build and run the migrated version of WaveTerm from the `src_new` directory.

## What's Changed

- Migrated from class components to functional components
- Migrated from LESS to Tailwind CSS
- New directory structure under `src_new/`
- Updated build configuration

## Building the New Version

### Development Build

```bash
# Watch mode (auto-rebuild on changes)
scripthaus run webpack-watch-new

# Single build
scripthaus run webpack-build-new
```

### Production Build

```bash
scripthaus run webpack-build-prod-new
```

## Key Differences

1. **Entry Point**: `src_new/main.tsx` instead of `src/index.ts`
2. **Output Directory**: 
   - Dev: `dist-dev-new/` instead of `dist-dev/`
   - Prod: `dist-new/` instead of `dist/`
3. **Dev Server Port**: 9001 instead of 9000
4. **Styles**: Tailwind CSS in `globals.css` instead of LESS files

## Running Both Versions

You can run both the old and new versions simultaneously:

```bash
# Terminal 1 - Old version
scripthaus run webpack-watch

# Terminal 2 - New version  
scripthaus run webpack-watch-new
```

## Components Migration Status

### ✅ Completed
- `/app/app.tsx` → `/app.tsx` (functional component)
- `/app/app.less` → `/globals.css` (Tailwind CSS)
- `/app/common/modals/*` → `/components/modals/*`
- `/app/bookmarks/*` → `/components/bookmarks/*`
- `/app/clientsettings/*` → `/components/elements/*`
- `/app/connections/*` → `/components/connections/*`
- `/app/history/*` → `/components/history/*`

### ⏳ TODO
- MainSideBar and RightSideBar components
- PluginsView component
- ErrorBoundary component
- TermStyleList component
- Various utility functions (fontutil, textmeasure)

## TypeScript Configuration

- Use `tsconfig.new.json` for the new structure
- Path aliases are updated to point to `src_new/`
- Some legacy aliases remain for gradual migration

## Debugging issues

- Always take reference of the old files in src/ folder to debug any issues in the new files.