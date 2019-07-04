all: index.bundle.js

index.js: index.ts
	npm run build

index.bundle.js: index.js
	npm run dist

# Assumes VS Code is running in watch build mode
watch:
	fswatch -0 -o -l .1 index.js | xargs -0 -n 1 -I {} make